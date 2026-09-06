// Memory retrieval via pgvector cosine similarity — spec §3.6.
// Returns top-5 most relevant memory entries for a (user, character) pair,
// ranked by similarity to the current query text boosted by importance.
import 'server-only'
import type { BasePayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { getEmbedding, toVectorLiteral } from '@/shared/ai/embeddings'
import { logger } from '@/shared/lib/logger'

// Payload doubles the suffix on relationship columns: the field `userId` becomes
// the column `user_id`, then the relationship itself appends `_id` → `user_id_id`.
// These queries are raw SQL (Payload has no vector field type) so the mapping is
// not done for us. Getting this wrong is silent: the query throws, the catch
// below swallows it, and retrieval returns [] on every single message — which is
// exactly what prod did until 2026-09-06. Keep in sync with
// `src/payload/collections/memory-entries.ts`.
const USER_COL = 'user_id_id'
const CHARACTER_COL = 'character_id_id'

export type MemoryEntry = {
  id: string | number
  category: string
  content: string
  importance: number
}

export type RetrieveMemoriesInput = {
  payload: BasePayload
  userId: string | number
  characterId: string | number
  queryText: string
  limit?: number
}

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryEntry[]> {
  const { payload, userId, characterId, queryText, limit = 5 } = input

  // If embeddings aren't configured, fall back to most-important recent memories.
  const pool = (payload.db as unknown as PostgresAdapter).pool
  if (!pool) return []

  const queryEmbedding = await getEmbedding(queryText).catch(() => null)

  try {
    if (queryEmbedding) {
      // Vector search: cosine distance + importance boost.
      const vectorLiteral = toVectorLiteral(queryEmbedding)
      const result = await pool.query<{
        id: number
        category: string
        content: string
        importance: number
      }>(
        `SELECT id, category, content, importance
         FROM memory_entries
         WHERE ${USER_COL} = $1
           AND ${CHARACTER_COL} = $2
           AND deleted_at IS NULL
           AND embedding IS NOT NULL
         ORDER BY (embedding <=> $3::vector) + (1.0 / (importance + 1)) ASC
         LIMIT $4`,
        [userId, characterId, vectorLiteral, limit],
      )
      return result.rows
    } else {
      // Fallback: return most important recent memories without vector search.
      const result = await pool.query<{
        id: number
        category: string
        content: string
        importance: number
      }>(
        `SELECT id, category, content, importance
         FROM memory_entries
         WHERE ${USER_COL} = $1
           AND ${CHARACTER_COL} = $2
           AND deleted_at IS NULL
         ORDER BY importance DESC, extracted_at DESC
         LIMIT $3`,
        [userId, characterId, limit],
      )
      return result.rows
    }
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

/** Format retrieved memories as a system prompt block. */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map((m) => `- ${m.content}`)
  return `[What I know about you:]\n${lines.join('\n')}`
}
