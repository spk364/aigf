// Write side of character memory: ONE background LLM call per batch of new
// messages, which updates all three memory stores at once:
//   - the profile (memory-profiles) — core facts, rewritten by merging;
//   - the conversation's rolling summary (conversations.summary);
//   - episodic memories (memory-entries) — new moments, semantically deduped.
//
// It replaces two older jobs (fact extraction every 10 user turns, summary every
// 6) that each re-read the same overlapping ~30-message window: two LLM calls
// over mostly already-processed text, which also re-extracted the same facts on
// every pass. This job reads only the messages AFTER its checkpoint
// (conversations.summaryUpToMessageId) and advances the checkpoint when done, so
// every message is processed once.
//
// Triggers:
//   - chat route, once MEMORY_BATCH_MESSAGES messages are past the checkpoint;
//   - "clear history", which flushes the unprocessed tail before deleting it;
//   - the daily /api/cron/process-memory sweep, for conversations that went
//     quiet mid-batch or whose in-request run failed.
//
// Read side: retrieve-memories.ts.
import 'server-only'
import type { BasePayload } from 'payload'
import { getSqlPool, type SqlPool } from '@/shared/db/sql-pool'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { getEmbeddings, toVectorLiteral, EMBEDDING_MODEL_TAG } from '@/shared/ai/embeddings'
import { env } from '@/shared/config/env'
import { logger } from '@/shared/lib/logger'
import { redis } from '@/shared/redis/client'
import { replyLanguageName } from '@/features/chat/language-guard'
import { USER_COL, CHARACTER_COL, loadProfile } from './retrieve-memories'

// Run once this many messages (user + assistant) sit past the checkpoint —
// about 6 user turns. Must stay well under the chat route's 30-message history
// window, so the summary is refreshed before anything scrolls out of view.
export const MEMORY_BATCH_MESSAGES = 12
// Below this there's too little to learn from; wait for more.
export const MIN_BATCH_MESSAGES = 4
// Upper bound per run. A backlog (failed runs, legacy conversations) drains over
// successive triggers instead of one huge prompt.
export const MAX_BATCH_MESSAGES = 40

export const PROFILE_MAX_CHARS = 1_500
const SUMMARY_MAX_CHARS = 2_000
const MAX_FACTS_PER_RUN = 5
// Cosine distance under which a new fact is "the same" as one already stored
// ("User's name is Alex." vs "The user is called Alex."). Text normalisation
// can't catch paraphrases; this can.
export const DUPLICATE_DISTANCE = 0.15
// Hard cap on episodic memories per (user, character). Keeps retrieval an exact
// scan over a small set (no ANN index needed) and storage bounded per user.
// Overflow evicts the least important, then the oldest.
export const MAX_ENTRIES_PER_PAIR = 200
const LOCK_TTL_SECONDS = 120

const CATEGORIES = ['personal_info', 'preference', 'event', 'relationship', 'sensitive'] as const
type Category = (typeof CATEGORIES)[number]

export type MemoryFact = { category: Category; content: string; importance: number }
export type MemoryUpdate = { profile: string; summary: string; facts: MemoryFact[] }
export type JobMessage = { id: string | number; role: 'user' | 'assistant'; content: string }

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Relationship values arrive as an id or a populated doc depending on depth. */
export function relId(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return ((v as { id?: string | number }).id ?? null) as string | number | null
  return v as string | number
}

/** How many of these message ids are past the checkpoint (null = none processed). */
export function countUnprocessed(
  ids: Array<string | number>,
  checkpoint: string | number | null,
): number {
  if (checkpoint === null) return ids.length
  const cp = Number(checkpoint)
  return ids.filter((id) => Number(id) > cp).length
}

export function shouldRunMemoryJob(unprocessed: number): boolean {
  return unprocessed >= MEMORY_BATCH_MESSAGES
}

/**
 * Comparison key for exact-duplicate detection when embeddings are unavailable.
 * The extractor is an LLM, so the same fact comes back with drifting
 * punctuation and casing — compare on letters and digits only.
 */
export function normaliseFact(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Validate the model's JSON. Returns null when it's unusable, so the caller
 * keeps the previous memory and leaves the checkpoint where it was (the batch
 * is retried next time).
 */
export function parseMemoryUpdate(raw: string): MemoryUpdate | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as { profile?: unknown; summary?: unknown; facts?: unknown }

  const profile = typeof obj.profile === 'string' ? obj.profile.trim().slice(0, PROFILE_MAX_CHARS) : ''
  const summary = typeof obj.summary === 'string' ? obj.summary.trim().slice(0, SUMMARY_MAX_CHARS) : ''

  const seen = new Set<string>()
  const facts: MemoryFact[] = []
  for (const f of Array.isArray(obj.facts) ? obj.facts : []) {
    const fact = f as { category?: unknown; content?: unknown; importance?: unknown }
    if (typeof fact.content !== 'string' || fact.content.trim().length <= 5) continue
    if (!CATEGORIES.includes(fact.category as Category)) continue
    const key = normaliseFact(fact.content)
    if (seen.has(key)) continue
    seen.add(key)
    const importance = typeof fact.importance === 'number' ? fact.importance : 3
    facts.push({
      category: fact.category as Category,
      content: fact.content.trim(),
      importance: Math.min(5, Math.max(1, Math.round(importance))),
    })
    if (facts.length >= MAX_FACTS_PER_RUN) break
  }

  if (!profile && !summary && facts.length === 0) return null
  return { profile, summary, facts }
}

const SYSTEM_PROMPT = `You maintain the long-term memory of an AI companion character in an ongoing romantic chat with a user. You receive the current memory and the newest messages. Return ONLY a JSON object:
{"profile": string, "summary": string, "facts": [{"category": string, "content": string, "importance": number}]}

"profile" — the character's permanent notes, in English, as short "- " lines under these headings (omit a heading with nothing under it):
About them:
Our relationship:
What I've told them about myself:
- Start from the current profile and carry forward everything still true.
- Add durable facts: name, age, location, job, family, pets, tastes, important life circumstances, pet names, milestones, promises and plans, boundaries and intimate preferences, and anything the character stated about herself that she must stay consistent with.
- If something changed or the user corrected it, REPLACE the old line. Never keep both versions.
- Leave out moods, small talk and anything true only in the moment.
- Never invent anything that isn't in the messages or the current profile.
- Under 1200 characters. If space runs short, keep the most important facts.
- If nothing new was learned, return the current profile unchanged.

"summary" — what has happened in this conversation lately, in {LANGUAGE}, at most 120 words of plain text. Merge the previous summary with the new messages: what they talked about last, the emotional tone, unresolved threads and plans. Don't repeat what belongs in the profile.

"facts" — 0 to 5 specific, memorable moments worth bringing up months from now that don't fit the profile: stories the user told, events in their life, notable shared moments. Each one is a standalone English sentence, for example "User told me about his trip to Sochi with his brother." category is one of: event, relationship, preference, personal_info, sensitive (health, grief, trauma). importance is 1 to 5. Use [] when nothing qualifies. Don't restate profile lines.`

export function buildMemoryPrompt(args: {
  profile: string
  summary: string
  messages: JobMessage[]
  language: string
}): { system: string; user: string } {
  const transcript = args.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content}`)
    .join('\n')
  return {
    system: SYSTEM_PROMPT.replace('{LANGUAGE}', replyLanguageName(args.language)),
    user: [
      `Current profile:\n${args.profile.trim() || '(empty)'}`,
      `Previous summary:\n${args.summary.trim() || '(none)'}`,
      `New messages:\n${transcript}`,
    ].join('\n\n'),
  }
}

// ── IO ───────────────────────────────────────────────────────────────────────

async function callMemoryLLM(prompt: { system: string; user: string }): Promise<MemoryUpdate | null> {
  if (!env.OPENROUTER_API_KEY) return null

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.2,
      max_tokens: 1_200,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`memory LLM call failed: ${response.status}`)

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
  return parseMemoryUpdate(data.choices[0]?.message?.content ?? '')
}

/**
 * Messages past the checkpoint, oldest first, capped at MAX_BATCH_MESSAGES.
 * Excludes superseded (regenerated-away) replies and empty rows (photo-only
 * turns, failed placeholders) — the same view of history the LLM gets.
 */
export async function loadUnprocessedMessages(
  payload: BasePayload,
  conversationId: string | number,
  checkpoint: string | number | null,
): Promise<JobMessage[]> {
  const res = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
        { isRegenerated: { not_equals: true } },
        ...(checkpoint !== null ? [{ id: { greater_than: checkpoint } }] : []),
      ],
    },
    sort: 'createdAt',
    limit: MAX_BATCH_MESSAGES,
    depth: 0,
    pagination: false,
    select: { role: true, content: true },
    overrideAccess: true,
  })
  return res.docs
    .map((d) => ({
      id: d.id as string | number,
      role: d.role as 'user' | 'assistant',
      content: ((d.content as string | null) ?? '').trim(),
    }))
    .filter((m) => m.content.length > 0)
}

async function saveProfile(
  payload: BasePayload,
  userId: string | number,
  characterId: string | number,
  existing: { id: string | number; profile: string } | null,
  profile: string,
): Promise<void> {
  // An empty profile back from the model when one exists is a model failure,
  // not "the user has no facts" — never let it wipe the core memory.
  if (!profile || profile === existing?.profile) return
  if (existing) {
    await payload.update({
      collection: 'memory-profiles',
      id: existing.id,
      data: { profile },
      overrideAccess: true,
    })
    return
  }
  try {
    await payload.create({
      collection: 'memory-profiles',
      data: { userId, characterId, profile },
      overrideAccess: true,
    })
  } catch (err) {
    // Lost a create race with a concurrent run (unique index on the pair).
    const raced = await loadProfile(payload, userId, characterId)
    if (!raced) throw err
    await payload.update({
      collection: 'memory-profiles',
      id: raced.id,
      data: { profile },
      overrideAccess: true,
    })
  }
}

async function saveFacts(args: {
  payload: BasePayload
  pool: SqlPool | null
  userId: string | number
  characterId: string | number
  conversationId: string | number
  lastMessageId: string | number | null
  facts: MemoryFact[]
}): Promise<number> {
  const { payload, pool, userId, characterId, conversationId, lastMessageId, facts } = args
  if (facts.length === 0) return 0

  const embeddings = await getEmbeddings(facts.map((f) => f.content)).catch((err: unknown) => {
    logger.warn({ msg: 'memory.job.embed_failed', err: err instanceof Error ? err.message : err })
    return null
  })

  // Text-level fallback dedup, only needed when we can't compare vectors.
  let known: Set<string> | null = null
  if (!embeddings) {
    const existing = await payload.find({
      collection: 'memory-entries',
      where: {
        and: [
          { userId: { equals: userId } },
          { characterId: { equals: characterId } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: MAX_ENTRIES_PER_PAIR,
      depth: 0,
      pagination: false,
      select: { content: true },
      overrideAccess: true,
    })
    known = new Set(existing.docs.map((d) => normaliseFact(String((d as { content?: unknown }).content ?? ''))))
  }

  let added = 0
  for (const [i, fact] of facts.entries()) {
    const embedding = embeddings?.[i] ?? null
    const vector = embedding ? toVectorLiteral(embedding) : null

    if (vector && pool) {
      const nearest = await pool.query<{ id: number; distance: number }>(
        `SELECT id, (embedding <=> $3::halfvec) AS distance
         FROM memory_entries
         WHERE ${USER_COL} = $1 AND ${CHARACTER_COL} = $2
           AND deleted_at IS NULL AND embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT 1`,
        [userId, characterId, vector],
      )
      const hit = nearest.rows[0]
      if (hit && Number(hit.distance) < DUPLICATE_DISTANCE) {
        // Same fact again: refresh it instead of storing a second copy, so
        // repetition reads as "still true and important", not as clutter.
        await pool.query(
          `UPDATE memory_entries
           SET importance = GREATEST(importance, $2), extracted_at = now()
           WHERE id = $1`,
          [hit.id, fact.importance],
        )
        continue
      }
    } else if (known) {
      const key = normaliseFact(fact.content)
      if (known.has(key)) continue
      known.add(key)
    }

    const entry = await payload.create({
      collection: 'memory-entries',
      data: {
        userId,
        characterId,
        conversationId,
        category: fact.category,
        content: fact.content,
        importance: fact.importance,
        extractedFromMessageId: lastMessageId,
        extractedAt: new Date().toISOString(),
        embeddingModel: vector ? EMBEDDING_MODEL_TAG : null,
      },
      depth: 0,
      overrideAccess: true,
    })
    // Payload has no vector field type — the column is written by raw SQL.
    if (vector && pool) {
      await pool.query(`UPDATE memory_entries SET embedding = $1::halfvec WHERE id = $2`, [vector, entry.id])
    }
    added++
  }

  if (added > 0 && pool) {
    await pool.query(
      `DELETE FROM memory_entries
       WHERE id IN (
         SELECT id FROM memory_entries
         WHERE ${USER_COL} = $1 AND ${CHARACTER_COL} = $2 AND deleted_at IS NULL
         ORDER BY importance DESC, extracted_at DESC
         OFFSET $3
       )`,
      [userId, characterId, MAX_ENTRIES_PER_PAIR],
    )
  }
  return added
}

export type RunMemoryJobInput = {
  payload: BasePayload
  conversationId: string | number
  userId: string | number
  characterId: string | number
  language: string
  /**
   * Process exactly these messages instead of reading from the checkpoint, and
   * leave the conversation row alone. Used by "clear history", which deletes
   * the messages and resets the summary right after loading them.
   */
  messages?: JobMessage[]
}

export type MemoryJobResult =
  | { status: 'done'; processed: number; factsAdded: number }
  | { status: 'skipped'; reason: 'locked' | 'too_few_messages' | 'no_update' }

export async function runMemoryJob(input: RunMemoryJobInput): Promise<MemoryJobResult> {
  const { payload, conversationId, userId, characterId, language } = input
  const flush = input.messages !== undefined

  // One run per conversation at a time — two overlapping runs would both pay
  // for the LLM call and race on the profile and checkpoint.
  const lockKey = `memory-job:${conversationId}`
  const holders = await redis.incr(lockKey).catch(() => 1)
  if (holders > 1) return { status: 'skipped', reason: 'locked' }
  await redis.expire(lockKey, LOCK_TTL_SECONDS).catch(() => 0)

  try {
    let summary = ''
    let messages: JobMessage[]
    if (flush) {
      messages = input.messages ?? []
    } else {
      const conversation = await payload.findByID({
        collection: 'conversations',
        id: conversationId,
        depth: 0,
        overrideAccess: true,
      })
      summary = (conversation.summary as string | null) ?? ''
      messages = await loadUnprocessedMessages(payload, conversationId, relId(conversation.summaryUpToMessageId))
    }
    if (messages.length < MIN_BATCH_MESSAGES) return { status: 'skipped', reason: 'too_few_messages' }

    const existingProfile = await loadProfile(payload, userId, characterId)
    const update = await callMemoryLLM(
      buildMemoryPrompt({ profile: existingProfile?.profile ?? '', summary, messages, language }),
    )
    if (!update) {
      logger.warn({ msg: 'memory.job.no_update', conversationId })
      return { status: 'skipped', reason: 'no_update' }
    }

    await saveProfile(payload, userId, characterId, existingProfile, update.profile)

    const lastMessageId = messages[messages.length - 1]!.id
    const factsAdded = await saveFacts({
      payload,
      pool: getSqlPool(payload),
      userId,
      characterId,
      conversationId,
      lastMessageId,
      facts: update.facts,
    })

    // Advance the checkpoint last: if anything above threw, the batch is
    // retried by the next trigger instead of being silently skipped.
    if (!flush) {
      await payload.update({
        collection: 'conversations',
        id: conversationId,
        data: {
          ...(update.summary ? { summary: update.summary } : {}),
          summaryUpToMessageId: lastMessageId,
          summaryUpdatedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
    }

    logger.info({
      msg: 'memory.job.done',
      conversationId,
      flush,
      processed: messages.length,
      factsAdded,
      profileChars: update.profile.length,
    })
    return { status: 'done', processed: messages.length, factsAdded }
  } finally {
    await redis.del(lockKey).catch(() => 0)
  }
}
