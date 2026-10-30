// Read side of character memory — what goes into the prompt on each turn.
//
// Two layers per (user, character) pair:
//   1. Profile (memory-profiles): a short core-memory document, ALWAYS injected.
//      Holds the facts that matter most (name, job, pet names, milestones), so
//      they never depend on a similarity search happening to surface them —
//      "tired after my shift" must not need to embed close to "works as a nurse".
//   2. Episodic memories (memory-entries): specific moments and stories, found
//      by vector similarity to the last few turns. Only the ones that clear a
//      relevance threshold are injected, so an unrelated message adds nothing.
//
// The write side is memory-job.ts.
import 'server-only'
import type { BasePayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { getEmbedding, toVectorLiteral } from '@/shared/ai/embeddings'
import { logger } from '@/shared/lib/logger'

// Payload doubles the suffix on relationship columns: the field `userId` becomes
// the column `user_id`, then the relationship itself appends `_id` → `user_id_id`.
// These queries are raw SQL (Payload has no vector field type) so the mapping is
// not done for us. Getting this wrong is silent: the query throws, the catch
// swallows it, and retrieval returns [] on every single message — which is
// exactly what prod did until 2026-09-06. Keep in sync with
// `src/payload/collections/memory-entries.ts`.
export const USER_COL = 'user_id_id'
export const CHARACTER_COL = 'character_id_id'

// Episodic memories injected per turn. The profile carries the core facts, so
// this is the long tail — a few is plenty.
const EPISODIC_LIMIT = 4
// Cosine distance (1 − similarity) above which a memory is considered unrelated
// to the current turn and left out. text-embedding-3 similarities for related
// short texts typically land around 0.3–0.6, unrelated ones below ~0.2.
export const MAX_RELEVANT_DISTANCE = 0.7
// How much one importance point (1–5) offsets distance when ranking. Small on
// purpose: importance breaks ties between similarly relevant memories, it must
// not drag an unrelated "critical" memory into every turn.
const IMPORTANCE_WEIGHT = 0.03
// Without embeddings (no OPENAI_API_KEY) we can't judge relevance at all, so
// inject only the very top few by importance.
const FALLBACK_LIMIT = 3
// The embedding call sits on the chat hot path, before the reply streams.
const QUERY_EMBED_TIMEOUT_MS = 3_000
// How many recent messages form the search query, and its size cap.
const QUERY_MESSAGES = 3
const QUERY_MAX_CHARS = 1_000

export type MemoryEntry = {
  id: string | number
  category: string
  content: string
  importance: number
}

type Pool = PostgresAdapter['pool']

function getPool(payload: BasePayload): Pool | null {
  return (payload.db as unknown as Partial<PostgresAdapter>).pool ?? null
}

/**
 * Search text for this turn: the last few messages, not just the latest one.
 * A bare "haha yes" or "лалала" embeds to noise; the surrounding turns carry
 * what the conversation is actually about.
 */
export function buildMemoryQuery(recent: Array<{ content?: unknown }>): string {
  return recent
    .slice(-QUERY_MESSAGES)
    .map((m) => (typeof m.content === 'string' ? m.content.trim() : ''))
    .filter(Boolean)
    .join('\n')
    .slice(-QUERY_MAX_CHARS)
}

export async function loadProfile(
  payload: BasePayload,
  userId: string | number,
  characterId: string | number,
): Promise<{ id: string | number; profile: string } | null> {
  const res = await payload.find({
    collection: 'memory-profiles',
    where: {
      and: [{ userId: { equals: userId } }, { characterId: { equals: characterId } }],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const doc = res.docs[0] as { id: string | number; profile?: string | null } | undefined
  return doc ? { id: doc.id, profile: doc.profile ?? '' } : null
}

export type RetrieveMemoriesInput = {
  payload: BasePayload
  userId: string | number
  characterId: string | number
  queryText: string
  limit?: number
}

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryEntry[]> {
  const { payload, userId, characterId, queryText, limit = EPISODIC_LIMIT } = input

  const pool = getPool(payload)
  if (!pool) return []

  try {
    // Most pairs have no episodic memories at all. Check first so they don't
    // pay for an embedding round-trip on every message.
    const has = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM memory_entries
         WHERE ${USER_COL} = $1 AND ${CHARACTER_COL} = $2 AND deleted_at IS NULL
       ) AS exists`,
      [userId, characterId],
    )
    if (!has.rows[0]?.exists) return []

    const queryEmbedding = queryText.trim()
      ? await getEmbedding(queryText, { timeoutMs: QUERY_EMBED_TIMEOUT_MS }).catch(() => null)
      : null

    if (queryEmbedding) {
      // Exact scan over this pair's rows (capped by the job, see memory-job.ts);
      // there is deliberately no ANN index — see migrations/0012_memory_v2.sql.
      const result = await pool.query<MemoryEntry>(
        `SELECT id, category, content, importance
         FROM (
           SELECT id, category, content, importance,
                  (embedding <=> $3::halfvec) AS distance
           FROM memory_entries
           WHERE ${USER_COL} = $1
             AND ${CHARACTER_COL} = $2
             AND deleted_at IS NULL
             AND embedding IS NOT NULL
         ) scored
         WHERE distance <= $4
         ORDER BY distance - $5 * importance ASC
         LIMIT $6`,
        [userId, characterId, toVectorLiteral(queryEmbedding), MAX_RELEVANT_DISTANCE, IMPORTANCE_WEIGHT, limit],
      )
      return result.rows
    }

    const result = await pool.query<MemoryEntry>(
      `SELECT id, category, content, importance
       FROM memory_entries
       WHERE ${USER_COL} = $1
         AND ${CHARACTER_COL} = $2
         AND deleted_at IS NULL
       ORDER BY importance DESC, extracted_at DESC
       LIMIT $3`,
      [userId, characterId, Math.min(limit, FALLBACK_LIMIT)],
    )
    return result.rows
  } catch (err) {
    logger.warn({
      msg: 'memory.retrieval.failed',
      userId,
      characterId,
      err: err instanceof Error ? err.message : err,
    })
    return []
  }
}

/** The always-on core-memory block. Empty string when there's no profile yet. */
export function formatProfileForPrompt(profile: string | null | undefined): string {
  const text = profile?.trim()
  if (!text) return ''
  return [
    '[Your long-term memory of this person — your own private notes. Let it shape what you say naturally; never recite it or mention keeping notes.]',
    text,
  ].join('\n')
}

/** Episodic memories relevant to this turn. Empty string when none qualified. */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) => `- ${m.content}`)
  return `[Memories that may be relevant right now — bring one up only if it fits naturally:]\n${lines.join('\n')}`
}

/** The rolling summary block, shared by the chat and regenerate routes. */
export function formatSummaryForPrompt(summary: string | null | undefined): string {
  const text = summary?.trim()
  return text ? `Earlier conversation summary: ${text}` : ''
}

export type MemoryContext = { profileBlock: string; episodicBlock: string }

/**
 * Everything memory contributes to one turn's prompt. Never throws — memory is
 * an enhancement, a failure here must not cost the user their reply.
 */
export async function loadMemoryContext(input: {
  payload: BasePayload
  userId: string | number
  characterId: string | number
  /** Chronological recent messages; the tail becomes the search query. */
  recentMessages: Array<{ content?: unknown }>
}): Promise<MemoryContext> {
  const { payload, userId, characterId, recentMessages } = input
  const [profile, memories] = await Promise.all([
    loadProfile(payload, userId, characterId).catch((err: unknown) => {
      logger.warn({ msg: 'memory.profile.load_failed', err: err instanceof Error ? err.message : err })
      return null
    }),
    retrieveMemories({
      payload,
      userId,
      characterId,
      queryText: buildMemoryQuery(recentMessages),
    }),
  ])
  return {
    profileBlock: formatProfileForPrompt(profile?.profile),
    episodicBlock: formatMemoriesForPrompt(memories),
  }
}
