import 'server-only'
import type { BasePayload } from 'payload'
import {
  submitImageJob,
  fetchImageJobStatus,
  FAL_ENDPOINT_LORA,
  FAL_ENDPOINT_IP_ADAPTER_FACE_ID,
  type ImageJobStatus,
} from '@/shared/ai/fal'
import { submitAtlasImageJob, fetchAtlasImageJobStatus } from '@/shared/ai/atlas'
import {
  DEFAULT_IMAGE_MODEL_ID,
  detectImageProvider,
  findImageModel,
} from '@/shared/ai/image-models'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { classifyImageSafety } from '@/shared/ai/safety'
import { recordContentFlag, recordSafetyIncident } from '@/features/safety/incidents'
import { maybeEscalate } from '@/features/safety/escalation'
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

// Watchdog deadline for a single chat image job. Past this, finalize fails the
// message and refunds the reserved tokens rather than pending forever. Kept
// just under the client's ~5 min poll window so a slow-but-real Atlas WAN job
// has time to finish before we give up on it.
const IMAGE_JOB_TIMEOUT_MS = 290_000

type ChatImageGenerationMetadata = {
  falJob?: {
    requestId: string
    statusUrl: string
    responseUrl: string
    cancelUrl: string
    endpoint: string
    modelName: string
    submittedAt: string
    // Which provider's poller finalizeChatImageJob must use.
    provider?: 'fal' | 'atlas'
  }
  prompt?: string
  negativePrompt?: string
  // Set once the generated image has been persisted to storage. Lets a poll
  // that died between persist and the final message update (most commonly the
  // age classifier failing closed during its 60–90s cold start) retry the
  // safety gate on the next poll without re-persisting a duplicate asset.
  persistedAsset?: {
    mediaAssetId: string | number
    publicUrl: string
    width: number
    height: number
  }
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
  // Model id to dispatch (atlas slug, fal `fal-ai/...` slug, or HF repo id).
  // Defaults to the admin's default model (DEFAULT_IMAGE_MODEL_ID = Atlas
  // WAN 2.6) so chat photos match what the admin generates.
  modelId?: string
  // Character reference / primary image URL. When present we condition the
  // generation on it for identity consistency — Atlas image-edit takes it as
  // the source image; fal uses IP-Adapter Face-ID. Mirrors the admin route.
  referenceImageUrl?: string | null
  // Output resolution bucket. Derived from the requested shot framing (see
  // shot-framing.ts) so full-body/reclining shots get a fitting aspect ratio.
  // Defaults to the SDXL-native portrait bucket when omitted.
  imageSize?: { width: number; height: number }
}

export type SubmitChatImageResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Submit a chat image job for an existing assistant-message in `pending` state.
 * Provider-aware (fal or Atlas) and reference-conditioned, mirroring the admin
 * generate-image route so chat photos look like the character. Stashes job
 * handles + provider into the message's generationMetadata so the status route
 * can poll the right backend.
 *
 * Caller is responsible for: token reservation (already happened upstream)
 * and entitlement / balance checks.
 */
export async function submitChatImageJob(
  input: SubmitChatImageInput,
): Promise<SubmitChatImageResult> {
  const log = createLogger({ userId: String(input.userId) })

  try {
    const modelId = input.modelId ?? DEFAULT_IMAGE_MODEL_ID
    const modelMeta = findImageModel(modelId)
    const provider = modelMeta?.provider ?? detectImageProvider(modelId)
    const isFlux = modelMeta?.isFlux ?? false
    const ref = input.referenceImageUrl?.trim() || null
    // Resolution bucket from the requested shot framing; falls back to the
    // SDXL-native portrait bucket (Atlas reads it as "832*1216").
    const imageSize = input.imageSize ?? { width: 832, height: 1216 }

    let handles: Awaited<ReturnType<typeof submitImageJob>>

    if (provider === 'atlas') {
      // Use the image-edit sibling when we can condition on a reference image
      // (keeps the character's identity); otherwise text-to-image. WAN 2.6
      // exposes both as `…/text-to-image` and `…/image-edit`.
      const endpoint = ref
        ? modelId.replace('text-to-image', 'image-edit')
        : modelId.replace('image-edit', 'text-to-image')
      handles = await submitAtlasImageJob({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        imageSize,
        numImages: 1,
        endpoint,
        ...(ref && endpoint.includes('image-edit') ? { ipAdapterImageUrl: ref } : {}),
      })
    } else {
      // fal. Reference → IP-Adapter Face-ID for face consistency (incompatible
      // with FLUX). HF repo ids route through fal-ai/lora; native `fal-ai/...`
      // slugs pass through.
      const useIpAdapter = !!ref && !isFlux
      const looksLikeHfRepo = !modelId.startsWith('fal-ai/')
      const endpoint = useIpAdapter
        ? FAL_ENDPOINT_IP_ADAPTER_FACE_ID
        : looksLikeHfRepo
          ? FAL_ENDPOINT_LORA
          : modelId
      const modelName = useIpAdapter ? undefined : looksLikeHfRepo ? modelId : undefined
      handles = await submitImageJob({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        imageSize,
        numImages: 1,
        endpoint,
        modelName,
        ...(useIpAdapter && ref ? { ipAdapterImageUrl: ref, ipAdapterScale: 0.7 } : {}),
      })
    }

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
        provider,
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
      progress: { phase: string; queuePosition?: number; lastLog?: string; provider?: string; raw?: string; requestId?: string; endpoint?: string }
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

  // Refund idempotency keys — same as the pre-async path. Safe to call
  // multiple times because autoRefund dedupes on idempotencyKey.
  const refundTechKey = `image:refund:tech:${input.messageId}`
  const refundSafetyKey = `image:refund:safety:${input.messageId}`

  // Server-side watchdog — checked BEFORE polling so a job that's stuck at the
  // provider (or whose status poll keeps erroring) can't pend forever and
  // silently burn the user's tokens. Past the deadline we fail + refund
  // regardless of what the backend reports. 170s covers cold starts while
  // staying under the client's ~180s poll budget.
  const elapsedMs = Date.now() - new Date(falJob.submittedAt).getTime()
  if (Number.isFinite(elapsedMs) && elapsedMs > IMAGE_JOB_TIMEOUT_MS) {
    log.error({ msg: 'chat.image.timeout', messageId: input.messageId, elapsedMs, provider: falJob.provider })
    // If the image was persisted but never cleared the safety gate (classifier
    // outage ran out the clock), pull the orphaned asset so an unclassified
    // image can't leak through the gallery or direct URL.
    if (meta.persistedAsset) {
      await input.payload.update({
        collection: 'media-assets',
        id: String(meta.persistedAsset.mediaAssetId),
        data: { deletedAt: new Date().toISOString() },
      }).catch(() => {})
    }
    await autoRefund(input.payload, {
      userId: input.userId,
      type: 'tech_refund',
      amount: IMAGE_TOKEN_COST,
      reason: `image_gen_timeout after ${Math.round(elapsedMs / 1000)}s`,
      relatedMessageId: input.messageId,
      idempotencyKey: refundTechKey,
    })
    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { status: 'failed', errorReason: 'generation_timeout', completedAt: new Date().toISOString() },
    })
    return { phase: 'failed', error: 'generation_timeout' }
  }

  // Single poll against the same provider we submitted to. If still pending,
  // return progress; the caller polls again (the watchdog above bounds it).
  let status: ImageJobStatus
  try {
    const pollArgs = {
      statusUrl: falJob.statusUrl,
      responseUrl: falJob.responseUrl,
      requestId: falJob.requestId,
      endpoint: falJob.endpoint,
      modelName: falJob.modelName,
      startedAtMs: new Date(falJob.submittedAt).getTime(),
    }
    status =
      falJob.provider === 'atlas'
        ? await fetchAtlasImageJobStatus(pollArgs)
        : await fetchImageJobStatus(pollArgs)
  } catch (pollErr) {
    const errMsg = pollErr instanceof Error ? pollErr.message : 'poll_failed'
    log.warn({ msg: 'chat.image.poll_error', provider: falJob.provider, err: errMsg })
    // Transient — let the next poll retry; the watchdog above guarantees we
    // don't spin past the deadline. Surface the error + provider for debugging.
    return { phase: 'pending', progress: { phase: 'unknown', lastLog: errMsg, provider: falJob.provider } }
  }

  if (status.status === 'pending') {
    log.info({
      msg: 'chat.image.pending',
      messageId: input.messageId,
      provider: falJob.provider,
      endpoint: falJob.endpoint,
      requestId: falJob.requestId,
      raw: status.raw,
      elapsedMs,
    })
    return {
      phase: 'pending',
      progress: {
        phase: status.phase,
        queuePosition: status.queuePosition,
        lastLog: status.lastLog,
        provider: falJob.provider,
        raw: status.raw,
        requestId: falJob.requestId,
        endpoint: falJob.endpoint,
      },
    }
  }

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

  // Persist exactly once across polls: a retry after a classifier stall finds
  // the asset in metadata and skips the duplicate storage write.
  let persistResult: { mediaAssetId: string | number; publicUrl: string }
  if (meta.persistedAsset) {
    persistResult = meta.persistedAsset
  } else {
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

    // Record the persisted asset before the safety gate runs, so a gate retry
    // (or a crash between classify and the final update) stays idempotent.
    meta.persistedAsset = {
      mediaAssetId: persistResult.mediaAssetId,
      publicUrl: persistResult.publicUrl,
      width: firstImage.width,
      height: firstImage.height,
    }
    await input.payload.update({
      collection: 'messages',
      id: input.messageId,
      data: { generationMetadata: meta },
    })
  }

  // Output-side apparent-age gate, env-switchable via CHAT_IMAGE_AGE_GATE.
  // The fal-hosted LLaVA-NeXT classifier scales to zero and cold-boots in
  // 60–100s (measured live 2026-06-07), past its own 45s call timeout — so a
  // synchronous gate stalled or failed nearly every "first photo after idle".
  // Modes:
  //   off       (default) — skip the output gate for chat photos. Prompt-side
  //             age controls (age-safety.ts shaping, negative prompts, input
  //             filter) still apply at generation time.
  //   fail_open — run the classifier; let the image through when it can't
  //             answer, still block on real flags.
  //   strict    — fail-closed per spec §3.10 Layer 6: keep the message pending
  //             and retry while the classifier warms; watchdog bounds the wait.
  const ageGateMode =
    process.env.CHAT_IMAGE_AGE_GATE === 'strict'
      ? 'strict'
      : process.env.CHAT_IMAGE_AGE_GATE === 'fail_open'
        ? 'fail_open'
        : 'off'

  if (ageGateMode !== 'off') {
    // The apparent-age gate is art-style-aware (anime → 18, realistic → 21).
    // Anime renders read young to the VLM by design, so without the style the
    // strict 21 floor false-flags every anime character's chat photo as
    // below_age_floor and silently deletes it ("photo won't generate"). Resolve
    // the style from the character behind this conversation; fall back to the
    // conservative realistic floor if it can't be determined.
    let artStyle: 'realistic' | 'anime' | undefined
    {
      const charRef = conversation.characterId
      const cid =
        typeof charRef === 'object' && charRef !== null
          ? (charRef as { id: string | number }).id
          : charRef
      if (cid) {
        try {
          const char = await input.payload.findByID({ collection: 'characters', id: cid })
          const s = (char as { artStyle?: unknown } | null)?.artStyle
          if (s === 'anime' || s === 'realistic') artStyle = s
        } catch {
          // Leave undefined → strict realistic floor.
        }
      }
    }

    const verdict = await classifyImageSafety({
      imageUrl: persistResult.publicUrl,
      width: firstImage.width,
      height: firstImage.height,
      artStyle,
    })

    if (verdict.flagged && !verdict.classifierRan) {
      // Classifier couldn't run and failed closed (production). Not a user
      // violation and usually not permanent — most often the cold start.
      if (ageGateMode === 'fail_open') {
        log.warn({ msg: 'chat.image.age_classifier_unavailable_failing_open', elapsedMs })
        // Fall through to completion below.
      } else {
        // strict: keep the message pending and re-run the gate on the next
        // poll (the asset is already persisted and recorded in metadata, so
        // retries don't duplicate it). The watchdog above bounds total wait
        // and soft-deletes the unclassified asset if it never comes back.
        log.warn({ msg: 'chat.image.age_classifier_unavailable_retrying', elapsedMs })
        return {
          phase: 'pending',
          progress: {
            phase: 'safety_check',
            lastLog: 'age classifier warming up, retrying',
            provider: falJob.provider,
            requestId: falJob.requestId,
            endpoint: falJob.endpoint,
          },
        }
      }
    } else if (verdict.flagged) {
      // Real flag: pull the asset (soft-delete keeps the row for forensics)
      // and fail the message.
      await input.payload.update({
        collection: 'media-assets',
        id: String(persistResult.mediaAssetId),
        data: { deletedAt: new Date().toISOString() },
      }).catch(() => {})

      log.warn({
        msg: 'chat.image.safety_flagged',
        mediaAssetId: persistResult.mediaAssetId,
        reason: verdict.reason,
        severe: verdict.severe,
        apparentAge: verdict.apparentAge,
      })

      const charRef = conversation.characterId
      const characterId =
        typeof charRef === 'object' && charRef !== null
          ? (charRef as { id: string | number }).id
          : charRef

      await autoRefund(input.payload, {
        userId: input.userId,
        type: 'safety_refund',
        amount: IMAGE_TOKEN_COST,
        reason: `safety_flagged: ${verdict.reason}`.slice(0, 240),
        relatedMessageId: input.messageId,
        idempotencyKey: refundSafetyKey,
      })

      await recordContentFlag(input.payload, {
        userId: input.userId,
        flagType: 'blocked_image',
        context: {
          category: verdict.category,
          reason: verdict.reason,
          apparentAge: verdict.apparentAge ?? null,
          minorRisk: verdict.minorRisk ?? null,
          source: 'web',
        },
      })

      await recordSafetyIncident(input.payload, {
        userId: input.userId,
        severity: verdict.severe ? 'critical' : 'high',
        category: 'age_classifier_flag',
        triggeredAt: 'apparent_age_classifier',
        detectionMethod: 'vision_model',
        relatedMessageId: input.messageId,
        relatedImageId: persistResult.mediaAssetId,
        relatedCharacterId: characterId ?? null,
        evidenceSnapshot: {
          reason: verdict.reason,
          apparentAge: verdict.apparentAge ?? null,
          minorRisk: verdict.minorRisk ?? null,
          model: result.modelName,
          endpoint: result.endpoint,
        },
      })

      await maybeEscalate(input.payload, input.userId, { severe: verdict.severe })

      await input.payload.update({
        collection: 'messages',
        id: input.messageId,
        data: { status: 'failed', errorReason: 'safety_flagged', completedAt: new Date().toISOString() },
      })
      return { phase: 'failed', error: 'safety_flagged' }
    }
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
