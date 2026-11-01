import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getCurrentUserMock = vi.fn()
vi.mock('@/shared/auth/current-user', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}))

const getPayloadMock = vi.fn()
vi.mock('payload', () => ({
  getPayload: (...args: unknown[]) => getPayloadMock(...args),
}))

vi.mock('@payload-config', () => ({ default: {} }))

const ensureGreetingMock = vi.fn()
vi.mock('@/features/chat/ensure-greeting', () => ({
  ensureGreeting: (...args: unknown[]) => ensureGreetingMock(...args),
}))

// The route only takes column-name constants and relId from the memory modules;
// stub their env-reading dependencies so importing them stays side-effect free.
vi.mock('@/shared/config/env', () => ({ env: { OPENROUTER_API_KEY: 'test-key', OPENAI_API_KEY: '' } }))
vi.mock('@/shared/ai/embeddings', () => ({}))
vi.mock('@/shared/redis/client', () => ({ redis: {} }))

import { NextRequest } from 'next/server'
import { POST } from './route'

type Query = { sql: string; params: unknown[] }

function setup(opts: { conversation?: Record<string, unknown> | null; failOn?: RegExp } = {}) {
  const queries: Query[] = []
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (opts.failOn?.test(sql)) throw new Error('boom')
      return { rowCount: /^UPDATE messages/.test(sql.trim()) ? 7 : /^DELETE FROM memory_entries/.test(sql.trim()) ? 3 : 1, rows: [] }
    }),
    release: vi.fn(),
  }
  const conversation =
    opts.conversation === undefined
      ? { id: 10, userId: 8, characterId: { id: 28 }, language: 'ru', characterSnapshot: { name: 'Mara' } }
      : opts.conversation
  const payload = {
    // Shaped like vercelPostgresAdapter: no `pool`, the VercelPool sits on drizzle.$client.
    db: { drizzle: { $client: { connect: vi.fn(async () => client) } } },
    findByID: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'conversations') return conversation
      return { id: 28, name: 'Mara' }
    }),
  }
  getPayloadMock.mockResolvedValue(payload)
  return { queries, client, payload }
}

function call(body: unknown = { locale: 'ru' }) {
  const req = new NextRequest('http://localhost/api/chat/conversations/10/clear', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req, { params: Promise.resolve({ id: '10' }) })
}

describe('POST /api/chat/conversations/[id]/clear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserMock.mockResolvedValue({ id: 8 })
    ensureGreetingMock.mockResolvedValue({ id: '700', content: 'Привет!' })
  })

  it('wipes messages, counters and memory in one transaction, then re-greets', async () => {
    const { queries, client } = setup()
    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, greeting: { id: '700', content: 'Привет!' } })

    const sqls = queries.map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(' '))
    expect(sqls).toEqual([
      'BEGIN',
      'UPDATE messages SET',
      'UPDATE conversations SET',
      'DELETE FROM memory_entries',
      'DELETE FROM memory_profiles',
      'COMMIT',
    ])
    // Every message, media included — no type filter.
    expect(queries[1]!.sql).not.toMatch(/type/)
    expect(queries[1]!.params).toEqual([10])
    expect(queries[2]!.sql).toMatch(/message_count = 0/)
    expect(queries[2]!.sql).toMatch(/relationship_score = 0/)
    expect(queries[3]!.params).toEqual([8, 28])
    expect(queries[4]!.params).toEqual([8, 28])
    expect(client.release).toHaveBeenCalledOnce()

    expect(ensureGreetingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conversationId: 10, locale: 'ru', fallbackName: 'Mara' }),
    )
  })

  it('rolls back and reports failure when any statement fails', async () => {
    const { queries, client } = setup({ failOn: /memory_profiles/ })
    const res = await call()

    expect(res.status).toBe(500)
    expect(queries.map((q) => q.sql)).toContain('ROLLBACK')
    expect(queries.map((q) => q.sql)).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
    expect(ensureGreetingMock).not.toHaveBeenCalled()
  })

  it("refuses another user's conversation without touching the database", async () => {
    const { queries } = setup({
      conversation: { id: 10, userId: 99, characterId: 28 },
    })
    const res = await call()

    expect(res.status).toBe(403)
    expect(queries).toHaveLength(0)
  })

  it('401s without a session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    setup()
    const res = await call()
    expect(res.status).toBe(401)
  })

  it('still succeeds when the greeting fails, and ignores an unknown locale', async () => {
    ensureGreetingMock.mockRejectedValue(new Error('llm down'))
    setup()
    const res = await call({ locale: 'xx' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, greeting: null })
    // Falls back to the conversation's language.
    expect(ensureGreetingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locale: 'ru' }),
    )
  })
})
