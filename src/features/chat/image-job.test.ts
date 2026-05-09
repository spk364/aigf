import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted module mocks for the heavy/IO deps. We test finalizeChatImageJob's
// state machine; the things it calls (fal poll, R2 persist, safety classifier,
// ledger refund, posthog track) are mocked.

vi.mock('server-only', () => ({}))

const fetchImageJobStatusMock = vi.fn()
vi.mock('@/shared/ai/fal', () => ({
  submitImageJob: vi.fn(),
  fetchImageJobStatus: (args: unknown) => fetchImageJobStatusMock(args),
}))

const persistMock = vi.fn()
vi.mock('@/features/media/persist-generated-image', () => ({
  persistGeneratedImage: (args: unknown) => persistMock(args),
}))

const classifyMock = vi.fn()
vi.mock('@/shared/ai/safety', () => ({
  classifyImageSafety: (args: unknown) => classifyMock(args),
}))

const autoRefundMock = vi.fn()
vi.mock('@/features/tokens/ledger', () => ({
  autoRefund: (...args: unknown[]) => autoRefundMock(...args),
}))

vi.mock('@/shared/analytics/posthog', () => ({
  track: vi.fn(),
}))

vi.mock('@/shared/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { finalizeChatImageJob } from './image-job'
import type { BasePayload } from 'payload'

type Row = Record<string, unknown> & { id: string }

function makePayload(rows: { messages?: Row[]; conversations?: Row[]; 'media-assets'?: Row[] }) {
  const store: Record<string, Row[]> = {
    messages: rows.messages ?? [],
    conversations: rows.conversations ?? [],
    'media-assets': rows['media-assets'] ?? [],
  }
  return {
    findByID: vi.fn(async (args: { collection: string; id: string }) => {
      const row = store[args.collection]?.find((r) => r.id === args.id)
      return row ?? null
    }),
    update: vi.fn(async (args: { collection: string; id: string; data: Record<string, unknown> }) => {
      const row = store[args.collection]?.find((r) => r.id === args.id)
      if (!row) throw new Error(`row missing in ${args.collection}/${args.id}`)
      Object.assign(row, args.data)
      return row
    }),
    __store: store,
  } as unknown as BasePayload & { __store: Record<string, Row[]> }
}

const baseConvo: Row = {
  id: 'conv-1',
  userId: 'user-1',
  messageCount: 0,
  daysActiveCount: 0,
  lastMessageAt: null,
}

const baseHandles = {
  requestId: 'req-1',
  statusUrl: 'https://fal/status',
  responseUrl: 'https://fal/result',
  cancelUrl: 'https://fal/cancel',
  endpoint: 'fal-ai/realistic-vision',
  modelName: 'fal-ai/realistic-vision',
  submittedAt: '2026-05-09T12:00:00Z',
}

beforeEach(() => {
  fetchImageJobStatusMock.mockReset()
  persistMock.mockReset()
  classifyMock.mockReset()
  autoRefundMock.mockReset()
})

describe('finalizeChatImageJob', () => {
  it('returns not_found when message is missing', async () => {
    const payload = makePayload({})
    const result = await finalizeChatImageJob({ payload, messageId: 'nope', userId: 'user-1' })
    expect(result.phase).toBe('not_found')
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
  })

  it('returns forbidden for a non-owner', async () => {
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-2' })
    expect(result.phase).toBe('forbidden')
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
  })

  it('short-circuits on already-completed message (does not re-poll fal)', async () => {
    const payload = makePayload({
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          status: 'completed',
          imageAssetId: { id: 'asset-1', publicUrl: 'https://cdn/img.jpg', width: 832, height: 1216 },
        },
      ],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('completed')
    if (result.phase === 'completed') {
      expect(result.publicUrl).toBe('https://cdn/img.jpg')
    }
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
    expect(persistMock).not.toHaveBeenCalled()
  })

  it('short-circuits on already-failed message', async () => {
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'failed', errorReason: 'fal_blew_up' }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.error).toBe('fal_blew_up')
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
  })

  it('returns pending with progress when fal status is in-flight', async () => {
    fetchImageJobStatusMock.mockResolvedValue({
      status: 'pending',
      phase: 'queued',
      queuePosition: 3,
      lastLog: 'in queue',
    })
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('pending')
    if (result.phase === 'pending') {
      expect(result.progress.queuePosition).toBe(3)
    }
    expect(persistMock).not.toHaveBeenCalled()
    expect(autoRefundMock).not.toHaveBeenCalled()
  })

  it('refunds on fal failure (tech_refund) and marks msg failed', async () => {
    fetchImageJobStatusMock.mockResolvedValue({ status: 'failed', error: 'fal_oom' })
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    expect(autoRefundMock).toHaveBeenCalledTimes(1)
    expect(autoRefundMock.mock.calls[0]![1]).toMatchObject({
      type: 'tech_refund',
      idempotencyKey: 'image:refund:tech:msg-1',
    })
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('failed')
  })

  it('persists, classifies and completes on fal success', async () => {
    fetchImageJobStatusMock.mockResolvedValue({
      status: 'completed',
      result: {
        images: [{ url: 'https://fal/img.jpg', width: 832, height: 1216, contentType: 'image/jpeg' }],
        seed: 42,
        requestId: 'req-1',
        modelName: 'fal-ai/realistic-vision',
        endpoint: 'fal-ai/realistic-vision',
        latencyMs: 12345,
      },
    })
    persistMock.mockResolvedValue({
      mediaAssetId: 'asset-99',
      publicUrl: 'https://cdn/asset-99.jpg',
      storageKey: 'k',
    })
    classifyMock.mockResolvedValue({ flagged: false })

    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [{ ...baseConvo }],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('completed')
    if (result.phase === 'completed') {
      expect(result.mediaAssetId).toBe('asset-99')
      expect(result.publicUrl).toBe('https://cdn/asset-99.jpg')
    }
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('completed')
    expect(msg.imageAssetId).toBe('asset-99')
    expect(msg.userTokensSpent).toBe(2)
    expect(autoRefundMock).not.toHaveBeenCalled()
    const convo = payload.__store.conversations[0]!
    expect(convo.messageCount).toBe(2)
  })

  it('safety-refunds and soft-deletes asset when classifier flags', async () => {
    fetchImageJobStatusMock.mockResolvedValue({
      status: 'completed',
      result: {
        images: [{ url: 'https://fal/img.jpg', width: 832, height: 1216, contentType: 'image/jpeg' }],
        seed: 0,
        requestId: 'req-1',
        modelName: 'fal-ai/realistic-vision',
        endpoint: 'fal-ai/realistic-vision',
        latencyMs: 9000,
      },
    })
    persistMock.mockResolvedValue({
      mediaAssetId: 'asset-flag',
      publicUrl: 'https://cdn/flag.jpg',
      storageKey: 'k',
    })
    classifyMock.mockResolvedValue({ flagged: true, reason: 'minor_likeness' })

    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
      'media-assets': [{ id: 'asset-flag', publicUrl: 'https://cdn/flag.jpg' }],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.error).toBe('safety_flagged')

    expect(autoRefundMock).toHaveBeenCalledTimes(1)
    expect(autoRefundMock.mock.calls[0]![1]).toMatchObject({
      type: 'safety_refund',
      idempotencyKey: 'image:refund:safety:msg-1',
    })
    const asset = payload.__store['media-assets']![0]!
    expect(asset.deletedAt).toBeTruthy()
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('failed')
    expect(msg.errorReason).toBe('safety_flagged')
  })

  it('treats missing fal handles as failed (defensive)', async () => {
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: {} }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.error).toBe('no_job_handles')
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
  })

  it('treats fal poll exception as still-pending (next poll will retry)', async () => {
    fetchImageJobStatusMock.mockRejectedValue(new Error('ECONNRESET'))
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('pending')
    expect(autoRefundMock).not.toHaveBeenCalled()
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('pending') // unchanged
  })
})
