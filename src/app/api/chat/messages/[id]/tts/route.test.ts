import { describe, it, expect, beforeEach, vi } from 'vitest'

// Heavy/IO module mocks must be declared before importing the route handler.
// vi.mock is hoisted, so this works at file top-level despite the import order.

vi.mock('server-only', () => ({}))

const getCurrentUserMock = vi.fn()
vi.mock('@/shared/auth/current-user', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}))

const getPayloadMock = vi.fn()
vi.mock('payload', () => ({
  getPayload: (...args: unknown[]) => getPayloadMock(...args),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

const generateSpeechMock = vi.fn()
vi.mock('@/shared/ai/tts', () => ({
  generateSpeech: (...args: unknown[]) => generateSpeechMock(...args),
}))

vi.mock('@/shared/ai/voice-catalog', () => ({
  DEFAULT_VOICE_ID: 'voice-default',
  findVoiceById: (id: string) =>
    id === 'voice-default'
      ? { id: 'voice-default', providerVoiceId: 'minimax-1', endpoint: 'fal-ai/minimax-tts' }
      : null,
}))

const persistAudioMock = vi.fn()
vi.mock('@/features/media/persist-generated-audio', () => ({
  persistGeneratedAudio: (...args: unknown[]) => persistAudioMock(...args),
}))

const spendMock = vi.fn()
const getBalanceMock = vi.fn()
const autoRefundMock = vi.fn()
vi.mock('@/features/tokens/ledger', () => ({
  spend: (...args: unknown[]) => spendMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
  autoRefund: (...args: unknown[]) => autoRefundMock(...args),
}))

const redisStore = new Map<string, number>()
vi.mock('@/shared/redis/client', () => ({
  redis: {
    async get<T>(key: string): Promise<T | null> {
      return (redisStore.get(key) ?? null) as T | null
    },
    async incr(key: string): Promise<number> {
      const next = (redisStore.get(key) ?? 0) + 1
      redisStore.set(key, next)
      return next
    },
    async decr(key: string): Promise<number> {
      const next = (redisStore.get(key) ?? 0) - 1
      redisStore.set(key, next)
      return next
    },
    async expire(): Promise<number> {
      return 1
    },
    async del(key: string): Promise<number> {
      return redisStore.delete(key) ? 1 : 0
    },
  },
}))

import { POST } from './route'

type PayloadStub = {
  findByID: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function makePayload(
  data: {
    message?: Record<string, unknown> | null
    conversation?: Record<string, unknown> | null
    character?: Record<string, unknown> | null
    activeSub?: Record<string, unknown> | null
    audioAsset?: Record<string, unknown> | null
  } = {},
): PayloadStub {
  return {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'messages') return data.message ?? null
      if (collection === 'conversations') return data.conversation ?? null
      if (collection === 'characters') return data.character ?? null
      if (collection === 'media-assets') return data.audioAsset ?? null
      void id
      return null
    }),
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'subscriptions') {
        return { docs: data.activeSub ? [data.activeSub] : [] }
      }
      return { docs: [] }
    }),
    update: vi.fn(async () => ({})),
  }
}

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id })
}

const ASSISTANT_TEXT_MSG = {
  id: 'msg-1',
  role: 'assistant',
  type: 'text',
  content: 'Hey there, how are you today?',
  conversationId: 'conv-1',
}
const CONV_OWNED = { id: 'conv-1', userId: 'user-1' }
const PREMIUM_SUB = { id: 'sub-1', userId: 'user-1', plan: 'premium_monthly', status: 'active' }
const PREMIUM_PLUS_SUB = { id: 'sub-2', userId: 'user-1', plan: 'premium_plus_monthly', status: 'active' }

beforeEach(() => {
  getCurrentUserMock.mockReset()
  getPayloadMock.mockReset()
  generateSpeechMock.mockReset()
  persistAudioMock.mockReset()
  spendMock.mockReset()
  getBalanceMock.mockReset()
  autoRefundMock.mockReset()
  redisStore.clear()
  process.env.FAL_KEY = 'test-key'
})

describe('POST /api/chat/messages/[id]/tts', () => {
  it('returns 401 for unauthenticated request', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(401)
  })

  it('returns 402 for non-premium user (premium gate)', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: null,
    })
    getPayloadMock.mockResolvedValue(payload)

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('premium_required')
    expect(spendMock).not.toHaveBeenCalled()
  })

  it('returns cached asset without spending when audioAssetId already set', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: {
        ...ASSISTANT_TEXT_MSG,
        audioAssetId: { id: 'asset-cached', publicUrl: 'https://cdn/cached.mp3' },
      },
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { cached: boolean; audioUrl: string }
    expect(body.cached).toBe(true)
    expect(body.audioUrl).toBe('https://cdn/cached.mp3')
    expect(spendMock).not.toHaveBeenCalled()
    expect(generateSpeechMock).not.toHaveBeenCalled()
  })

  it('returns 402 when balance is below TTS_TOKEN_COST', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)
    getBalanceMock.mockResolvedValue(1) // < TTS_TOKEN_COST (2)

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('insufficient_tokens')
    expect(spendMock).not.toHaveBeenCalled()
    expect(generateSpeechMock).not.toHaveBeenCalled()
  })

  it('returns 429 when daily cap exhausted', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB, // cap 50/day for premium_monthly
    })
    getPayloadMock.mockResolvedValue(payload)
    // Pre-fill cap counter to the cap value
    const today = new Date().toISOString().slice(0, 10)
    redisStore.set(`tts:day:user-1:${today}`, 50)

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('daily_cap_reached')
    expect(spendMock).not.toHaveBeenCalled()
  })

  it('spends + increments cap + persists on successful generation', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_PLUS_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)
    getBalanceMock.mockResolvedValue(100)
    spendMock.mockResolvedValue({ ok: true, balanceAfter: 98 })
    generateSpeechMock.mockResolvedValue({
      audioUrl: 'https://fal/audio.mp3',
      contentType: 'audio/mpeg',
      durationSec: 7,
      requestId: 'req-tts-1',
      latencyMs: 5000,
    })
    persistAudioMock.mockResolvedValue({
      mediaAssetId: 'asset-new',
      publicUrl: 'https://cdn/new.mp3',
    })

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; cached: boolean; audioUrl: string }
    expect(body.ok).toBe(true)
    expect(body.cached).toBe(false)
    expect(body.audioUrl).toBe('https://cdn/new.mp3')

    expect(spendMock).toHaveBeenCalledTimes(1)
    const spendArgs = spendMock.mock.calls[0]![1] as { type: string; amount: number; idempotencyKey: string }
    expect(spendArgs.type).toBe('spend_voice_message')
    expect(spendArgs.amount).toBe(2) // TTS_TOKEN_COST
    expect(spendArgs.idempotencyKey).toBe('tts:reserve:msg-1')

    expect(autoRefundMock).not.toHaveBeenCalled()
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        id: 'msg-1',
        data: { audioAssetId: 'asset-new' },
      }),
    )

    // Cap increment happened
    const today = new Date().toISOString().slice(0, 10)
    expect(redisStore.get(`tts:day:user-1:${today}`)).toBe(1)
  })

  it('refunds when generateSpeech throws (tech_refund)', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)
    getBalanceMock.mockResolvedValue(100)
    spendMock.mockResolvedValue({ ok: true, balanceAfter: 98 })
    generateSpeechMock.mockRejectedValue(new Error('fal_timeout'))

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('tts_failed')

    expect(autoRefundMock).toHaveBeenCalledTimes(1)
    const refundArgs = autoRefundMock.mock.calls[0]![1] as { type: string; amount: number; idempotencyKey: string }
    expect(refundArgs.type).toBe('tech_refund')
    expect(refundArgs.amount).toBe(2)
    expect(refundArgs.idempotencyKey).toBe('tts:refund:tech:msg-1')
  })

  it('refunds when persistGeneratedAudio throws (tech_refund)', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)
    getBalanceMock.mockResolvedValue(100)
    spendMock.mockResolvedValue({ ok: true, balanceAfter: 98 })
    generateSpeechMock.mockResolvedValue({
      audioUrl: 'https://fal/audio.mp3',
      contentType: 'audio/mpeg',
      durationSec: 7,
      requestId: 'req-tts-1',
      latencyMs: 5000,
    })
    persistAudioMock.mockRejectedValue(new Error('r2_unreachable'))

    const res = await POST({} as Request, { params: makeParams('msg-1') })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('persist_failed')

    expect(autoRefundMock).toHaveBeenCalledTimes(1)
    const refundArgs = autoRefundMock.mock.calls[0]![1] as { type: string; idempotencyKey: string }
    expect(refundArgs.type).toBe('tech_refund')
    expect(refundArgs.idempotencyKey).toBe('tts:refund:tech:msg-1')
  })

  it('does not increment cap on a replayed spend (retry-safe)', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    const payload = makePayload({
      message: ASSISTANT_TEXT_MSG,
      conversation: CONV_OWNED,
      activeSub: PREMIUM_SUB,
    })
    getPayloadMock.mockResolvedValue(payload)
    getBalanceMock.mockResolvedValue(100)
    spendMock.mockResolvedValue({ ok: true, balanceAfter: 98, replayed: true })
    generateSpeechMock.mockResolvedValue({
      audioUrl: 'https://fal/audio.mp3',
      contentType: 'audio/mpeg',
      durationSec: 7,
      requestId: 'req-tts-1',
      latencyMs: 5000,
    })
    persistAudioMock.mockResolvedValue({
      mediaAssetId: 'asset-replay',
      publicUrl: 'https://cdn/replay.mp3',
    })

    await POST({} as Request, { params: makeParams('msg-1') })

    const today = new Date().toISOString().slice(0, 10)
    expect(redisStore.get(`tts:day:user-1:${today}`)).toBeUndefined()
  })
})
