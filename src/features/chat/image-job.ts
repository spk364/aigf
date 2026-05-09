import 'server-only'
import type { BasePayload } from 'payload'
import {
  submitImageJob,
  fetchImageJobStatus,
  type ImageJobStatus,
} from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { classifyImageSafety } from '@/shared/ai/safety'
import { autoRefund } from '@/features/tokens/ledger'
import { computeRelationshipScore, isNewActiveDay } from '@/features/chat/relationship-score'
import { track } from '@/shared/analytics/posthog'
import { createLogger } from '@/shared/lib/logger'

// Async chat-image generation pipeline.
//
// Splits the previously-monolithic image flow into:
//   1. submitChatImageJob — fast (~1s), returns a messageId the client polls.
//   2. finalizeChatImageJob — slow tail (poll fal → persist → classify),
//      idempotent on terminal states so multiple polls are safe.
//
// The motivation is Vercel's 60-second function cap: holding a single
// request open through a 30–60s fal generation is fragile and dies hard
// on cold starts or slow models.

export const IMAGE_TOKEN_COST = 2

type ChatImageGenerationMetadata = {
  falJob?: {
    requestId: string
    statusUrl: string
    responseUrl: string
    cancelUrl: string
    endpoint: string
    modelName: string
    submittedAt: string
  }
  prompt?: string
  negativePrompt?: string
  // Final completion fields populated by finalizeChatImageJob.
  model?: string
  endpoint?: string
  requestId?: string
  seed?: number
  latencyMs?: number
}

export type SubmitChatImageInput = {
  payload: BasePayload
  conversationId: string | number
  messageId: string
  userId: string | number
  prompt: string
  negativePrompt?: string
  imageSize?: 'portrait_4_3' | 'square_hd' | 'square'
}

export type SubmitChatImageResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Submit a fal job for an existing assistant-message in `pending` state.
 * Stashes job handles into the message's generationMetadata so the
 * status route can poll without holding extra DB columns.
 *
 * Caller is responsible for: token reservation (already happened upstream)
 * and entitlement / balance checks.
 */
export async function submitChatImageJob(
  input: SubmitChatImageInput,
): Promise<SubmitChatImageResult> {
  const log = createLogger({ userId: String(input.userId) })

  try {
    const handles = await submitImageJob({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      imageSize: input.imageSize ?? 'portrait_4_3',
    })

    const meta: ChatImageGenerationMetadata = {
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      falJob: {
        requestId: handles.requestId,
        statusUrl: handles.statusUrl,
        responseUrl: handles.responseUrl,
        cancelUrl: handles.cancelUrl,
        endpoint: handles.endpoint,
        modelName: handles.modelName,
        submittedAt: new Date().toISOString(),
      },
    }

    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { generationMetadata: meta },
    })

    log.info({ msg: 'chat.image.submitted', messageId: input.messageId, requestId: handles.requestId })
    return { ok: true }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'submit_failed'
    log.error({ msg: 'chat.image.submit_failed', messageId: input.messageId, err: errMsg })
    return { ok: false, error: errMsg }
  }
}

export type FinalizeChatImageInput = {
  payload: BasePayload
  messageId: string
  userId: string | number
}

export type FinalizeChatImageResult =
  | {
      phase: 'pending'
      progress: { phase: string; queuePosition?: number; lastLog?: string }
    }
  | { phase: 'completed'; mediaAssetId: string | number; publicUrl: string; width: number; height: number }
  | { phase: 'failed'; error: string }
  | { phase: 'not_found' }
  | { phase: 'forbidden' }

/**
 * Idempotent advance-to-completion for an in-flight chat image job.
 *
 * Reads the message, checks ownership, polls fal, and on terminal state
 * persists / classifies / refunds + updates message + conversation.
 *
 * If the message is already in a terminal state when called, returns the
 * cached result without re-polling fal — important because the client
 * polls this endpoint repeatedly until phase !== 'pending'.
 */
export async function finalizeChatImageJob(
  input: FinalizeChatImageInput,
): Promise<FinalizeChatImageResult> {
  const log = createLogger({ userId: String(input.userId), messageId: input.messageId })

  let message: Awaited<ReturnType<BasePayload['findByID']>>
  try {
    message = await input.payload.findByID({
      collection: 'messages',
      id: input.messageId,
      depth: 1,
    })
  } catch {
    return { phase: 'not_found' }
  }
  if (!message) return { phase: 'not_found' }

  // Ownership: walk message → conversation → userId.
  const convoRef = message.conversationId
  const convoId =
    typeof convoRef === 'object' && convoRef !== null
      ? (convoRef as { id: string | number }).id
      : convoRef
  if (!convoId) return { phase: 'not_found' }

  const conversation = await input.payload.findByID({
    collection: 'conversations',
    id: convoId,
  })
  if (!conversation) return { phase: 'not_found' }
  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId
  if (String(convUserId) !== String(input.userId)) return { phase: 'forbidden' }

  // Terminal-state short-circuit: client polls repeatedly, but once we've
  // finalized, the answer is stable. Read it from the message itself.
  if (message.status === 'completed') {
    const assetRef = message.imageAssetId
    if (assetRef && typeof assetRef === 'object' && 'publicUrl' in assetRef) {
      const a = assetRef as { id: string | number; publicUrl?: string; width?: number; height?: number }
      return {
        phase: 'completed',
        mediaAssetId: a.id,
        publicUrl: a.publicUrl ?? '',
        width: a.width ?? 0,
        height: a.height ?? 0,
      }
    }
    // Completed but somehow no asset link — treat as failed so the client
    // shows an error rather than spinning forever.
    return { phase: 'failed', error: 'image_lost' }
  }
  if (message.status === 'failed') {
    return {
      phase: 'failed',
      error: typeof message.errorReason === 'string' ? message.errorReason : 'image_failed',
    }
  }

  const meta = (message.generationMetadata ?? {}) as ChatImageGenerationMetadata
  const falJob = meta.falJob
  if (!falJob) {
    // Submitted but handles missing — should not happen in normal flow.
    return { phase: 'failed', error: 'no_job_handles' }
  }

  // Single fal poll. If still pending, return progress; the caller polls again.
  let status: ImageJobStatus
  try {
    status = await fetchImageJobStatus({
      statusUrl: falJob.statusUrl,
      responseUrl: falJob.responseUrl,
      requestId: falJob.requestId,
      endpoint: falJob.endpoint,
      modelName: falJob.modelName,
      startedAtMs: new Date(falJob.submittedAt).getTime(),
    })
  } catch (pollErr) {
    const errMsg = pollErr instanceof Error ? pollErr.message : 'poll_failed'
    log.warn({ msg: 'chat.image.poll_error', err: errMsg })
    // Don't terminate on poll errors — let the next poll retry. fal occasionally
    // blips with 5xx during long-running jobs.
    return { phase: 'pending', progress: { phase: 'unknown', lastLog: errMsg } }
  }

  if (status.status === 'pending') {
    return {
      phase: 'pending',
      progress: { phase: status.phase, queuePosition: status.queuePosition, lastLog: status.lastLog },
    }
  }

  // Refund idempotency keys — same as the pre-async path. Safe to call
  // multiple times because autoRefund dedupes on idempotencyKey.
  const refundTechKey = `image:refund:tech:${input.messageId}`
  const refundSafetyKey = `image:refund:safety:${input.messageId}`

  if (status.status === 'failed') {
    log.error({ msg: 'chat.image.gen_failed', err: status.error })
    await autoRefund(input.payload, {
      userId: input.userId,
      type: 'tech_refund',
      amount: IMAGE_TOKEN_COST,
      reason: `image_gen_failed: ${status.error}`.slice(0, 240),
      relatedMessageId: input.messageId,
      idempotencyKey: refundTechKey,
    })
    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { status: 'failed', errorReason: status.error.slice(0, 240), completedAt: new Date().toISOString() },
    })
    return { phase: 'failed', error: status.error }
  }

  // status === 'completed'. Persist → classify → update msg + conversation.
  const result = status.result
  const firstImage = result.images[0]
  if (!firstImage) {
    await autoRefund(input.payload, {
      userId: input.userId,
      type: 'tech_refund',
      amount: IMAGE_TOKEN_COST,
      reason: 'fal_no_images',
      relatedMessageId: input.messageId,
      idempotencyKey: refundTechKey,
    })
    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { status: 'failed', errorReason: 'fal_no_images', completedAt: new Date().toISOString() },
    })
    return { phase: 'failed', error: 'fal_no_images' }
  }

  let persistResult: Awaited<ReturnType<typeof persistGeneratedImage>>
  try {
    persistResult = await persistGeneratedImage({
      payload: input.payload,
      fromUrl: firstImage.url,
      width: firstImage.width,
      height: firstImage.height,
      contentType: firstImage.contentType,
      kind: 'message-image',
      ownerUserId: input.userId,
      relatedMessageId: input.messageId,
    })
  } catch (persistErr) {
    const errMsg = persistErr instanceof Error ? persistErr.message : 'persist_failed'
    log.error({ msg: 'chat.image.persist_failed', err: errMsg })
    await autoRefund(input.payload, {
      userId: input.userId,
      type: 'tech_refund',
      amount: IMAGE_TOKEN_COST,
      reason: `image_persist_failed: ${errMsg}`.slice(0, 240),
      relatedMessageId: input.messageId,
      idempotencyKey: refundTechKey,
    })
    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { status: 'failed', errorReason: errMsg.slice(0, 240), completedAt: new Date().toISOString() },
    })
    return { phase: 'failed', error: errMsg }
  }

  const verdict = await classifyImageSafety({
    imageUrl: persistResult.publicUrl,
    width: firstImage.width,
    height: firstImage.height,
  })

  if (verdict.flagged) {
    log.warn({ msg: 'chat.image.safety_flagged', mediaAssetId: persistResult.mediaAssetId, reason: verdict.reason })
    await input.payload.update({
      collection: 'media-assets',
      id: String(persistResult.mediaAssetId),
      data: { deletedAt: new Date().toISOString() },
    }).catch(() => {})

    await autoRefund(input.payload, {
      userId: input.userId,
      type: 'safety_refund',
      amount: IMAGE_TOKEN_COST,
      reason: `safety_flagged: ${verdict.reason}`.slice(0, 240),
      relatedMessageId: input.messageId,
      idempotencyKey: refundSafetyKey,
    })

    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { status: 'failed', errorReason: 'safety_flagged', completedAt: new Date().toISOString() },
    })
    return { phase: 'failed', error: 'safety_flagged' }
  }

  // Successful completion. Write back image asset, fold completion details
  // into generationMetadata, and tick conversation counters.
  const completedMeta: ChatImageGenerationMetadata = {
    ...meta,
    model: result.modelName,
    endpoint: result.endpoint,
    requestId: result.requestId,
    seed: result.seed,
    latencyMs: result.latencyMs,
  }

  await input.payload.update({
    collection: 'messages',
    id: input.messageId,
    data: {
      imageAssetId: persistResult.mediaAssetId as string,
      status: 'completed',
      completedAt: new Date().toISOString(),
      userTokensSpent: IMAGE_TOKEN_COST,
      spendType: 'image',
      generationMetadata: completedMeta,
    },
  })

  // Conversation tick — done at terminal time (not at submit) so an unfinished
  // image doesn't bump messageCount / relationshipScore.
  const cnt = (conversation.messageCount as number | null) ?? 0
  const days = (conversation.daysActiveCount as number | null) ?? 0
  const newDays = days + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
  const newCnt = cnt + 2
  const ts = new Date().toISOString()
  await input.payload.update({
    collection: 'conversations',
    id: convoId,
    data: {
      messageCount: newCnt,
      daysActiveCount: newDays,
      lastMessageAt: ts,
      lastMessagePreview: '[image]',
      relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
    },
  })

  track({
    userId: String(input.userId),
    event: 'chat.image_generated',
    properties: {
      model: result.modelName,
      seed: result.seed,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
      tokensSpent: IMAGE_TOKEN_COST,
    },
  })

  return {
    phase: 'completed',
    mediaAssetId: persistResult.mediaAssetId,
    publicUrl: persistResult.publicUrl,
    width: firstImage.width,
    height: firstImage.height,
  }
}
