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

const recordContentFlagMock = vi.fn()
const recordSafetyIncidentMock = vi.fn()
vi.mock('@/features/safety/incidents', () => ({
  recordContentFlag: (...args: unknown[]) => recordContentFlagMock(...args),
  recordSafetyIncident: (...args: unknown[]) => recordSafetyIncidentMock(...args),
}))

const maybeEscalateMock = vi.fn()
vi.mock('@/features/safety/escalation', () => ({
  maybeEscalate: (...args: unknown[]) => maybeEscalateMock(...args),
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

// Concrete keys so noUncheckedIndexedAccess doesn't widen __store.messages
// (etc.) to `Row[] | undefined` and force `!` assertions everywhere.
type Store = {
  messages: Row[]
  conversations: Row[]
  'media-assets': Row[]
}

function makePayload(rows: Partial<Store>) {
  const store: Store = {
    messages: rows.messages ?? [],
    conversations: rows.conversations ?? [],
    'media-assets': rows['media-assets'] ?? [],
  }
  return {
    findByID: vi.fn(async (args: { collection: string; id: string }) => {
      const row = store[args.collection as keyof Store]?.find((r) => r.id === args.id)
      return row ?? null
    }),
    update: vi.fn(async (args: { collection: string; id: string; data: Record<string, unknown> }) => {
      const row = store[args.collection as keyof Store]?.find((r) => r.id === args.id)
      if (!row) throw new Error(`row missing in ${args.collection}/${args.id}`)
      Object.assign(row, args.data)
      return row
    }),
    __store: store,
  } as unknown as BasePayload & { __store: Store }
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
  // Fresh by default so the pre-poll timeout watchdog doesn't fire — tests that
  // exercise the watchdog override this with a stale timestamp.
  submittedAt: new Date().toISOString(),
}

beforeEach(() => {
  fetchImageJobStatusMock.mockReset()
  persistMock.mockReset()
  classifyMock.mockReset()
  autoRefundMock.mockReset()
  recordContentFlagMock.mockReset()
  recordSafetyIncidentMock.mockReset()
  maybeEscalateMock.mockReset()
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
    // Fresh submission so the timeout watchdog doesn't fire.
    const freshHandles = { ...baseHandles, submittedAt: new Date().toISOString() }
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: freshHandles } }],
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

  it('times out and refunds a job stuck in-flight past the deadline', async () => {
    fetchImageJobStatusMock.mockResolvedValue({
      status: 'pending',
      phase: 'running',
      lastLog: 'still running',
    })
    // submittedAt far in the past → watchdog fires.
    const staleHandles = { ...baseHandles, submittedAt: '2026-05-09T12:00:00Z' }
    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: staleHandles } }],
      conversations: [baseConvo],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.error).toBe('generation_timeout')
    expect(autoRefundMock).toHaveBeenCalledTimes(1)
    expect(autoRefundMock.mock.calls[0]![1]).toMatchObject({
      type: 'tech_refund',
      idempotencyKey: 'image:refund:tech:msg-1',
    })
    expect(payload.__store.messages[0]!.status).toBe('failed')
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
    classifyMock.mockResolvedValue({
      flagged: true,
      reason: 'apparent_minor',
      category: 'age_classifier_flag',
      severe: true,
      apparentAge: 16,
      minorRisk: true,
      classifierRan: true,
    })

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
    // A real classifier flag opens an incident, records a behavioural flag, and
    // runs escalation with the severe bit forwarded.
    expect(recordSafetyIncidentMock).toHaveBeenCalledTimes(1)
    expect(recordSafetyIncidentMock.mock.calls[0]![1]).toMatchObject({
      category: 'age_classifier_flag',
      triggeredAt: 'apparent_age_classifier',
      severity: 'critical',
    })
    expect(recordContentFlagMock).toHaveBeenCalledTimes(1)
    expect(maybeEscalateMock).toHaveBeenCalledWith(payload, 'user-1', { severe: true })
    const asset = payload.__store['media-assets']![0]!
    expect(asset.deletedAt).toBeTruthy()
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('failed')
    expect(msg.errorReason).toBe('safety_flagged')
  })

  it('stays pending and retries when the classifier is unavailable (cold start)', async () => {
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
      mediaAssetId: 'asset-unavail',
      publicUrl: 'https://cdn/unavail.jpg',
      storageKey: 'k',
    })
    // classifierRan:false → fail-closed verdict (production behaviour), but the
    // job must NOT fail terminally: the classifier cold start (60–90s) exceeds
    // its 45s call timeout, so we keep pending and retry on the next poll.
    classifyMock.mockResolvedValue({
      flagged: true,
      reason: 'apparent_age_classifier_unavailable',
      category: 'age_classifier_flag',
      severe: false,
      classifierRan: false,
    })

    const payload = makePayload({
      messages: [{ id: 'msg-1', conversationId: 'conv-1', status: 'pending', generationMetadata: { falJob: baseHandles } }],
      conversations: [baseConvo],
      'media-assets': [{ id: 'asset-unavail', publicUrl: 'https://cdn/unavail.jpg' }],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('pending')
    if (result.phase === 'pending') expect(result.progress.phase).toBe('safety_check')

    // No refund, no incident, asset kept — this is a transient infra gap.
    expect(autoRefundMock).not.toHaveBeenCalled()
    expect(recordSafetyIncidentMock).not.toHaveBeenCalled()
    expect(maybeEscalateMock).not.toHaveBeenCalled()
    const asset = payload.__store['media-assets'][0]!
    expect(asset.deletedAt).toBeFalsy()
    const msg = payload.__store.messages[0]!
    expect(msg.status).toBe('pending')
    // Persisted asset recorded in metadata so the retry skips re-persisting.
    expect((msg.generationMetadata as { persistedAsset?: { mediaAssetId: string } }).persistedAsset)
      .toMatchObject({ mediaAssetId: 'asset-unavail' })

    // Second poll: classifier is back and clears the image — the job completes
    // without a duplicate persist.
    classifyMock.mockResolvedValue({ flagged: false })
    const retry = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(retry.phase).toBe('completed')
    if (retry.phase === 'completed') expect(retry.mediaAssetId).toBe('asset-unavail')
    expect(persistMock).toHaveBeenCalledTimes(1)
    expect(msg.status).toBe('completed')
  })

  it('watchdog soft-deletes the persisted-but-unclassified asset on timeout', async () => {
    const payload = makePayload({
      messages: [{
        id: 'msg-1',
        conversationId: 'conv-1',
        status: 'pending',
        generationMetadata: {
          falJob: { ...baseHandles, submittedAt: new Date(Date.now() - 400_000).toISOString() },
          persistedAsset: { mediaAssetId: 'asset-stale', publicUrl: 'https://cdn/stale.jpg', width: 832, height: 1216 },
        },
      }],
      conversations: [baseConvo],
      'media-assets': [{ id: 'asset-stale', publicUrl: 'https://cdn/stale.jpg' }],
    })
    const result = await finalizeChatImageJob({ payload, messageId: 'msg-1', userId: 'user-1' })
    expect(result.phase).toBe('failed')
    if (result.phase === 'failed') expect(result.error).toBe('generation_timeout')
    expect(autoRefundMock.mock.calls[0]![1]).toMatchObject({ type: 'tech_refund' })
    const asset = payload.__store['media-assets'][0]!
    expect(asset.deletedAt).toBeTruthy()
    expect(fetchImageJobStatusMock).not.toHaveBeenCalled()
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
