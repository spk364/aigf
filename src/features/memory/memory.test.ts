// Regression tests for the memory feature. Every failure this covers was live in
// production until 2026-09-06 and none of them surfaced, because each failure
// path is a catch + logger.warn — the feature degrades to silence, not to an
// error. These tests are the tripwire.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
// The real module validates process.env and calls process.exit(1) on import
// when keys are missing, which kills the test worker.
vi.mock('@/shared/config/env', () => ({ env: { OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' } }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const getEmbedding = vi.fn()
vi.mock('@/shared/ai/embeddings', () => ({
  getEmbedding: (...args: unknown[]) => getEmbedding(...args),
  toVectorLiteral: (e: number[]) => `[${e.join(',')}]`,
  EMBEDDING_MODEL: 'text-embedding-3-small',
}))

import { retrieveMemories, formatMemoriesForPrompt } from './retrieve-memories'
import { normaliseFact } from './extract-memories'

/** Minimal BasePayload stand-in exposing the pg pool the raw queries use. */
function payloadWithPool(query: ReturnType<typeof vi.fn>) {
  return { db: { pool: { query } } } as never
}

describe('retrieveMemories — SQL column names', () => {
  beforeEach(() => {
    getEmbedding.mockReset()
    getEmbedding.mockResolvedValue(null)
  })

  // The bug: the queries said `user_id` / `character_id`, but Payload names
  // relationship columns `user_id_id` / `character_id_id` (field `userId` →
  // `user_id`, then the relationship suffix `_id`). Postgres raised
  // `column "user_id" does not exist`, the catch swallowed it, and retrieval
  // returned [] on every message for the life of the feature.
  it('queries the doubled-suffix relationship columns, not the bare ones', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await retrieveMemories({
      payload: payloadWithPool(query),
      userId: 1,
      characterId: 2,
      queryText: 'hello',
    })

    const sql = query.mock.calls[0]![0] as string
    expect(sql).toContain('user_id_id = $1')
    expect(sql).toContain('character_id_id = $2')
    // A bare `user_id =` would mean the regression is back. Guard against it
    // without tripping on the legitimate `user_id_id`.
    expect(/\buser_id\s*=/.test(sql)).toBe(false)
    expect(/\bcharacter_id\s*=/.test(sql)).toBe(false)
  })

  it('uses the vector branch when an embedding is available', async () => {
    getEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await retrieveMemories({
      payload: payloadWithPool(query),
      userId: 1,
      characterId: 2,
      queryText: 'hello',
    })

    const [sql, params] = query.mock.calls[0]! as [string, unknown[]]
    expect(sql).toContain('embedding <=>')
    expect(sql).toContain('user_id_id = $1')
    expect(params[2]).toBe('[0.1,0.2,0.3]')
  })

  it('falls back to importance ordering when embeddings are unavailable', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await retrieveMemories({
      payload: payloadWithPool(query),
      userId: 1,
      characterId: 2,
      queryText: 'hello',
    })

    const sql = query.mock.calls[0]![0] as string
    expect(sql).toContain('ORDER BY importance DESC')
    expect(sql).not.toContain('embedding <=>')
  })

  it('returns [] rather than throwing when the query fails', async () => {
    const query = vi.fn().mockRejectedValue(new Error('column "user_id" does not exist'))
    const out = await retrieveMemories({
      payload: payloadWithPool(query),
      userId: 1,
      characterId: 2,
      queryText: 'hello',
    })
    expect(out).toEqual([])
  })

  it('returns [] when the adapter exposes no pool', async () => {
    const out = await retrieveMemories({
      payload: { db: {} } as never,
      userId: 1,
      characterId: 2,
      queryText: 'hello',
    })
    expect(out).toEqual([])
  })
})

describe('formatMemoriesForPrompt', () => {
  it('is empty for no memories, so no blank system block is pushed', () => {
    expect(formatMemoriesForPrompt([])).toBe('')
  })

  it('renders one bullet per memory under a header', () => {
    const block = formatMemoriesForPrompt([
      { id: 1, category: 'personal_info', content: "User's name is Alex.", importance: 5 },
      { id: 2, category: 'preference', content: 'User likes jazz.', importance: 3 },
    ])
    expect(block).toContain('[What I know about you:]')
    expect(block).toContain("- User's name is Alex.")
    expect(block).toContain('- User likes jazz.')
  })
})

describe('normaliseFact — duplicate detection key', () => {
  // Extraction re-runs every 10 user turns over an overlapping ~30-message
  // window, so the same fact comes back repeatedly with drifting punctuation and
  // casing. Retrieval takes only the top 5, so duplicates crowd out real
  // memories.
  it('collapses casing and punctuation drift onto one key', () => {
    expect(normaliseFact("User's name is Alex.")).toBe(normaliseFact('user s name is alex'))
    expect(normaliseFact('User likes jazz!!')).toBe(normaliseFact('  user  likes   jazz '))
  })

  it('keeps genuinely different facts apart', () => {
    expect(normaliseFact('User likes jazz.')).not.toBe(normaliseFact('User likes rock.'))
  })

  it('handles non-latin content without collapsing everything to empty', () => {
    expect(normaliseFact('Пользователя зовут Алекс.')).toBe('пользователя зовут алекс')
    expect(normaliseFact('Пользователя зовут Алекс.')).not.toBe(normaliseFact('Пользователю 30 лет.'))
  })
})
