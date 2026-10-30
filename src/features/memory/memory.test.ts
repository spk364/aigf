// Tests for character memory (retrieve-memories.ts + memory-job.ts). Every
// failure path in this feature is a catch + logger.warn, so it degrades to
// silence rather than an error — it was dead in prod for months without anyone
// noticing. These tests are the tripwire.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
// The real module validates process.env and calls process.exit(1) on import
// when keys are missing, which kills the test worker.
vi.mock('@/shared/config/env', () => ({ env: { OPENROUTER_API_KEY: 'test-key', OPENAI_API_KEY: '' } }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const getEmbedding = vi.fn()
const getEmbeddings = vi.fn()
vi.mock('@/shared/ai/embeddings', () => ({
  getEmbedding: (...args: unknown[]) => getEmbedding(...args),
  getEmbeddings: (...args: unknown[]) => getEmbeddings(...args),
  toVectorLiteral: (e: number[]) => `[${e.join(',')}]`,
  EMBEDDING_MODEL_TAG: 'text-embedding-3-small@512',
}))

const redisStore = new Map<string, number>()
vi.mock('@/shared/redis/client', () => ({
  redis: {
    incr: async (k: string) => {
      const n = (redisStore.get(k) ?? 0) + 1
      redisStore.set(k, n)
      return n
    },
    expire: async () => 1,
    del: async (k: string) => (redisStore.delete(k) ? 1 : 0),
  },
}))

import {
  retrieveMemories,
  buildMemoryQuery,
  formatMemoriesForPrompt,
  formatProfileForPrompt,
  formatSummaryForPrompt,
  MAX_RELEVANT_DISTANCE,
} from './retrieve-memories'
import {
  normaliseFact,
  parseMemoryUpdate,
  countUnprocessed,
  shouldRunMemoryJob,
  relId,
  buildMemoryPrompt,
  runMemoryJob,
  MEMORY_BATCH_MESSAGES,
  PROFILE_MAX_CHARS,
  MAX_ENTRIES_PER_PAIR,
  type JobMessage,
} from './memory-job'

/** Minimal BasePayload stand-in exposing the pg pool the raw queries use. */
function payloadWithPool(query: ReturnType<typeof vi.fn>) {
  return { db: { pool: { query } } } as never
}

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>

/** pg mock: the EXISTS pre-check answers `exists`, every other query `rows`. */
function poolQuery(exists: boolean, rows: unknown[] = []) {
  return vi.fn<QueryFn>(async (sql) =>
    sql.includes('SELECT EXISTS') ? { rows: [{ exists }] } : { rows },
  )
}

// ── retrieval ────────────────────────────────────────────────────────────────

describe('retrieveMemories', () => {
  beforeEach(() => {
    getEmbedding.mockReset()
    getEmbedding.mockResolvedValue(null)
  })

  // The original bug: queries said `user_id` / `character_id`, but Payload names
  // relationship columns `user_id_id` / `character_id_id`. Postgres raised,
  // the catch swallowed it, and retrieval returned [] for the life of the feature.
  it('queries the doubled-suffix relationship columns, not the bare ones', async () => {
    const query = poolQuery(true)
    await retrieveMemories({ payload: payloadWithPool(query), userId: 1, characterId: 2, queryText: 'hello' })

    for (const [sql] of query.mock.calls as Array<[string]>) {
      expect(sql).toContain('user_id_id = $1')
      expect(sql).toContain('character_id_id = $2')
      expect(/\buser_id\s*=/.test(sql)).toBe(false)
      expect(/\bcharacter_id\s*=/.test(sql)).toBe(false)
    }
  })

  it('skips the embedding call entirely when the pair has no memories', async () => {
    const query = poolQuery(false)
    const out = await retrieveMemories({ payload: payloadWithPool(query), userId: 1, characterId: 2, queryText: 'hi' })
    expect(out).toEqual([])
    expect(getEmbedding).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('searches by halfvec similarity with a relevance cutoff when an embedding exists', async () => {
    getEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    const query = poolQuery(true)
    await retrieveMemories({ payload: payloadWithPool(query), userId: 1, characterId: 2, queryText: 'hello' })

    const [sql, params] = query.mock.calls[1]! as [string, unknown[]]
    expect(sql).toContain('embedding <=> $3::halfvec')
    expect(sql).toContain('WHERE distance <= $4')
    expect(params[2]).toBe('[0.1,0.2,0.3]')
    expect(params[3]).toBe(MAX_RELEVANT_DISTANCE)
  })

  it('falls back to importance ordering when embeddings are unavailable', async () => {
    const query = poolQuery(true)
    await retrieveMemories({ payload: payloadWithPool(query), userId: 1, characterId: 2, queryText: 'hello' })

    const sql = query.mock.calls[1]![0] as string
    expect(sql).toContain('ORDER BY importance DESC')
    expect(sql).not.toContain('<=>')
  })

  it('returns [] rather than throwing when the query fails', async () => {
    const query = vi.fn().mockRejectedValue(new Error('column "user_id" does not exist'))
    const out = await retrieveMemories({ payload: payloadWithPool(query), userId: 1, characterId: 2, queryText: 'x' })
    expect(out).toEqual([])
  })

  it('returns [] when the adapter exposes no pool', async () => {
    const out = await retrieveMemories({ payload: { db: {} } as never, userId: 1, characterId: 2, queryText: 'x' })
    expect(out).toEqual([])
  })
})

describe('buildMemoryQuery', () => {
  it('uses the last three messages, not just the latest', () => {
    const q = buildMemoryQuery([
      { content: 'old' },
      { content: 'I just got back from my shift at the hospital' },
      { content: 'Poor thing, long day?' },
      { content: 'haha yes' },
    ])
    expect(q).not.toContain('old')
    expect(q).toContain('hospital')
    expect(q.endsWith('haha yes')).toBe(true)
  })

  it('ignores non-string and empty content', () => {
    expect(buildMemoryQuery([{ content: null }, { content: '  ' }, { content: 42 }])).toBe('')
  })
})

describe('prompt blocks', () => {
  it('are empty when there is nothing to say, so no blank system message is pushed', () => {
    expect(formatProfileForPrompt('')).toBe('')
    expect(formatProfileForPrompt(null)).toBe('')
    expect(formatMemoriesForPrompt([])).toBe('')
    expect(formatSummaryForPrompt('   ')).toBe('')
  })

  it('render their content under a header', () => {
    expect(formatProfileForPrompt('About them:\n- Name: Alex')).toContain('- Name: Alex')
    const block = formatMemoriesForPrompt([
      { id: 1, category: 'event', content: 'User went to Sochi with his brother.', importance: 3 },
    ])
    expect(block).toContain('- User went to Sochi with his brother.')
    expect(formatSummaryForPrompt('They talked about work.')).toBe(
      'Earlier conversation summary: They talked about work.',
    )
  })
})

// ── job: pure helpers ────────────────────────────────────────────────────────

describe('normaliseFact', () => {
  it('collapses casing and punctuation drift onto one key', () => {
    expect(normaliseFact("User's name is Alex.")).toBe(normaliseFact('user s name is alex'))
  })

  it('handles non-latin content without collapsing everything to empty', () => {
    expect(normaliseFact('Пользователя зовут Алекс.')).toBe('пользователя зовут алекс')
  })
})

describe('parseMemoryUpdate', () => {
  it('accepts a well-formed update', () => {
    const out = parseMemoryUpdate(
      JSON.stringify({
        profile: 'About them:\n- Name: Alex',
        summary: 'They talked about his trip.',
        facts: [{ category: 'event', content: 'User went to Sochi with his brother.', importance: 4 }],
      }),
    )
    expect(out).toEqual({
      profile: 'About them:\n- Name: Alex',
      summary: 'They talked about his trip.',
      facts: [{ category: 'event', content: 'User went to Sochi with his brother.', importance: 4 }],
    })
  })

  it('returns null for invalid JSON or an update with nothing in it', () => {
    expect(parseMemoryUpdate('not json')).toBeNull()
    expect(parseMemoryUpdate('[]')).toBeNull()
    expect(parseMemoryUpdate(JSON.stringify({ profile: '', summary: '', facts: [] }))).toBeNull()
  })

  it('drops invalid facts, clamps importance, and dedups within the batch', () => {
    const out = parseMemoryUpdate(
      JSON.stringify({
        profile: 'x',
        facts: [
          { category: 'gossip', content: 'Unknown category fact.', importance: 3 },
          { category: 'event', content: 'hi', importance: 3 },
          { category: 'event', content: 'User adopted a cat.', importance: 9 },
          { category: 'event', content: 'user adopted a cat', importance: 1 },
          { category: 'preference', content: 'User hates cilantro.' },
        ],
      }),
    )
    expect(out!.facts).toEqual([
      { category: 'event', content: 'User adopted a cat.', importance: 5 },
      { category: 'preference', content: 'User hates cilantro.', importance: 3 },
    ])
  })

  it('caps the profile length so it cannot grow without bound', () => {
    const out = parseMemoryUpdate(JSON.stringify({ profile: 'x'.repeat(PROFILE_MAX_CHARS + 500) }))
    expect(out!.profile.length).toBe(PROFILE_MAX_CHARS)
  })
})

describe('trigger helpers', () => {
  it('counts only messages past the checkpoint', () => {
    expect(countUnprocessed([1, 2, 3], null)).toBe(3)
    expect(countUnprocessed([5, 6, 7, 8], 6)).toBe(2)
    expect(countUnprocessed(['10', '11'], '10')).toBe(1)
  })

  it('fires at the batch threshold', () => {
    expect(shouldRunMemoryJob(MEMORY_BATCH_MESSAGES - 1)).toBe(false)
    expect(shouldRunMemoryJob(MEMORY_BATCH_MESSAGES)).toBe(true)
    // A failed run leaves the backlog over the threshold, so the next turn retries.
    expect(shouldRunMemoryJob(MEMORY_BATCH_MESSAGES + 7)).toBe(true)
  })

  it('relId reads ids and populated docs alike', () => {
    expect(relId(5)).toBe(5)
    expect(relId({ id: 7 })).toBe(7)
    expect(relId(null)).toBeNull()
    expect(relId(undefined)).toBeNull()
  })
})

describe('buildMemoryPrompt', () => {
  it('names the summary language and marks empty memory explicitly', () => {
    const p = buildMemoryPrompt({
      profile: '',
      summary: '',
      language: 'ru',
      messages: [{ id: 1, role: 'user', content: 'Привет' }],
    })
    expect(p.system).toContain('in Russian')
    expect(p.user).toContain('Current profile:\n(empty)')
    expect(p.user).toContain('User: Привет')
  })
})

// ── job: orchestration ───────────────────────────────────────────────────────

const MESSAGES: JobMessage[] = [
  { id: 101, role: 'user', content: "Hi, I'm Alex" },
  { id: 102, role: 'assistant', content: 'Nice to meet you, Alex' },
  { id: 103, role: 'user', content: 'I work night shifts at a hospital' },
  { id: 104, role: 'assistant', content: 'That sounds exhausting' },
]

type Call = { op: string; args: Record<string, unknown> }

function fakePayload(opts: {
  conversation?: Record<string, unknown>
  profile?: { id: number; profile: string } | null
  messages?: JobMessage[]
  poolRows?: (sql: string) => unknown[]
}) {
  const calls: Call[] = []
  const query = vi.fn<QueryFn>(async (sql) => ({ rows: opts.poolRows?.(sql) ?? [] }))
  const payload = {
    db: { pool: { query } },
    findByID: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ op: 'findByID', args })
      return { id: 1, summary: 'old summary', summaryUpToMessageId: 100, ...opts.conversation }
    }),
    find: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ op: 'find', args })
      if (args.collection === 'memory-profiles') return { docs: opts.profile ? [opts.profile] : [] }
      if (args.collection === 'messages') return { docs: opts.messages ?? MESSAGES }
      return { docs: [] }
    }),
    create: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ op: 'create', args })
      return { id: 900 }
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ op: 'update', args })
      return {}
    }),
  }
  return { payload: payload as never, calls, query }
}

function mockLLM(content: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const GOOD_UPDATE = JSON.stringify({
  profile: 'About them:\n- Name: Alex\n- Works night shifts at a hospital',
  summary: 'They met; Alex told her about his job.',
  facts: [{ category: 'event', content: 'Alex had a rough night shift.', importance: 3 }],
})

const base = { conversationId: 1, userId: 10, characterId: 20, language: 'en' }

describe('runMemoryJob', () => {
  beforeEach(() => {
    redisStore.clear()
    getEmbeddings.mockReset()
    getEmbeddings.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads from the checkpoint, writes profile + summary + facts, then advances the checkpoint', async () => {
    mockLLM(GOOD_UPDATE)
    const { payload, calls } = fakePayload({ profile: null })

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toEqual({ status: 'done', processed: 4, factsAdded: 1 })

    const msgFind = calls.find((c) => c.op === 'find' && c.args.collection === 'messages')!
    expect(JSON.stringify(msgFind.args.where)).toContain('"greater_than":100')

    const profileCreate = calls.find((c) => c.op === 'create' && c.args.collection === 'memory-profiles')!
    expect(profileCreate.args.data).toMatchObject({ userId: 10, characterId: 20 })

    const convUpdate = calls.filter((c) => c.op === 'update' && c.args.collection === 'conversations')
    expect(convUpdate).toHaveLength(1)
    expect(convUpdate[0]!.args.data).toMatchObject({
      summary: 'They met; Alex told her about his job.',
      summaryUpToMessageId: 104,
    })
    // The checkpoint is the LAST write, so a failure earlier means a retry.
    expect(calls[calls.length - 1]).toBe(convUpdate[0])
  })

  it('never lets an empty profile from the model wipe the existing one', async () => {
    mockLLM(JSON.stringify({ profile: '', summary: 'still talking', facts: [] }))
    const { payload, calls } = fakePayload({ profile: { id: 5, profile: '- Name: Alex' } })

    await runMemoryJob({ payload, ...base })
    expect(calls.some((c) => c.args.collection === 'memory-profiles' && c.op !== 'find')).toBe(false)
  })

  it('leaves the checkpoint alone when the model output is unusable', async () => {
    mockLLM('sorry, I cannot help with that')
    const { payload, calls } = fakePayload({ profile: null })

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toEqual({ status: 'skipped', reason: 'no_update' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('waits for more messages when the batch is too small', async () => {
    const fetchMock = mockLLM(GOOD_UPDATE)
    const { payload } = fakePayload({ messages: MESSAGES.slice(0, 2) })

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toEqual({ status: 'skipped', reason: 'too_few_messages' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips when another run holds the lock for this conversation', async () => {
    const fetchMock = mockLLM(GOOD_UPDATE)
    redisStore.set('memory-job:1', 1)
    const { payload } = fakePayload({})

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toEqual({ status: 'skipped', reason: 'locked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('releases the lock even when the run throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    const { payload } = fakePayload({})

    await expect(runMemoryJob({ payload, ...base })).rejects.toThrow('memory LLM call failed: 500')
    expect(redisStore.has('memory-job:1')).toBe(false)
  })

  it('flush mode (clear history) processes the given messages and never touches the conversation', async () => {
    mockLLM(GOOD_UPDATE)
    const { payload, calls } = fakePayload({ profile: { id: 5, profile: '- Name: Alex' } })

    const res = await runMemoryJob({ payload, ...base, messages: MESSAGES })
    expect(res.status).toBe('done')
    expect(calls.some((c) => c.op === 'findByID')).toBe(false)
    expect(calls.some((c) => c.op === 'update' && c.args.collection === 'conversations')).toBe(false)
    expect(calls.some((c) => c.op === 'update' && c.args.collection === 'memory-profiles')).toBe(true)
  })

  it('refreshes a semantically duplicate fact instead of inserting a second copy', async () => {
    mockLLM(GOOD_UPDATE)
    getEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { payload, calls, query } = fakePayload({
      profile: null,
      poolRows: (sql) => (sql.includes('ORDER BY distance') ? [{ id: 77, distance: 0.05 }] : []),
    })

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toMatchObject({ factsAdded: 0 })
    expect(calls.some((c) => c.op === 'create' && c.args.collection === 'memory-entries')).toBe(false)
    const refresh = query.mock.calls.find(([sql]) => String(sql).includes('GREATEST(importance'))
    expect(refresh?.[1]).toEqual([77, 3])
  })

  it('stores a new fact with its embedding and enforces the per-pair cap', async () => {
    mockLLM(GOOD_UPDATE)
    getEmbeddings.mockResolvedValue([[0.1, 0.2]])
    const { payload, calls, query } = fakePayload({
      profile: null,
      poolRows: (sql) => (sql.includes('ORDER BY distance') ? [{ id: 77, distance: 0.6 }] : []),
    })

    const res = await runMemoryJob({ payload, ...base })
    expect(res).toMatchObject({ factsAdded: 1 })
    const created = calls.find((c) => c.op === 'create' && c.args.collection === 'memory-entries')!
    expect(created.args.data).toMatchObject({ embeddingModel: 'text-embedding-3-small@512', importance: 3 })

    const sqls = query.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }))
    expect(sqls.find((q) => q.sql.includes('SET embedding = $1::halfvec'))?.params).toEqual(['[0.1,0.2]', 900])
    expect(sqls.find((q) => q.sql.includes('OFFSET $3'))?.params).toEqual([10, 20, MAX_ENTRIES_PER_PAIR])
  })
})
