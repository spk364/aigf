// Lazy TTS for an assistant chat message. Generates audio via fal.ai
// MiniMax (~3-15 s for typical chat-length text), persists it to R2 +
// media-assets, caches the asset id on the message, and returns the URL.
//
// Subsequent ▶ clicks return the cached asset without re-generating.
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { generateSpeech } from '@/shared/ai/tts'
import { findVoiceById, DEFAULT_VOICE_ID } from '@/shared/ai/voice-catalog'
import { persistGeneratedAudio } from '@/features/media/persist-generated-audio'
import { isPremiumPlan, type PlanKey } from '@/features/billing/plans'
import { TTS_TOKEN_COST, TTS_DAILY_CAP_BY_PLAN } from '@/features/billing/cost'
import { autoRefund, getBalance, spend } from '@/features/tokens/ledger'
import { redis } from '@/shared/redis/client'

// MiniMax sync cap is 5000 chars; chat messages should never approach that,
// but guard anyway so a runaway message can't blow up the request.
const MAX_TTS_CHARS = 1500

// Wall-clock key for daily TTS cap. UTC so the reset moment is unambiguous
// across user timezones; pairs with secondsUntilNextMidnightUTC for Retry-After.
function ttsDayKey(userId: string | number): string {
  return `tts:day:${userId}:${new Date().toISOString().slice(0, 10)}`
}

function secondsUntilNextMidnightUTC(): number {
  const now = new Date()
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
  return Math.floor((next.getTime() - now.getTime()) / 1000) + 3600
}

type MaybeRel<T> = T | { id: string | number; [k: string]: unknown } | string | number | null | undefined

function relIdOf<T>(rel: MaybeRel<T>): string | number | null {
  if (rel == null) return null
  if (typeof rel === 'object' && 'id' in rel) {
    const id = (rel as { id?: string | number }).id
    return id ?? null
  }
  if (typeof rel === 'string' || typeof rel === 'number') return rel
  return null
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: messageId } = await params
  const payload = await getPayload({ config })

  let message: Record<string, unknown>
  try {
    message = (await payload.findByID({
      collection: 'messages',
      id: messageId,
      depth: 1,
      overrideAccess: true,
    })) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  }
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  }

  // Only assistant text messages get a ▶. User messages aren't voiced (they
  // are the user's own typing) and image/video/action messages have no text.
  if (message.role !== 'assistant') {
    return NextResponse.json({ error: 'tts_only_for_assistant_messages' }, { status: 400 })
  }
  const allowedTypes = new Set(['text', 'voice'])
  if (typeof message.type === 'string' && !allowedTypes.has(message.type)) {
    return NextResponse.json({ error: 'tts_unsupported_message_type' }, { status: 400 })
  }
  const text = typeof message.content === 'string' ? message.content.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'message_has_no_text' }, { status: 400 })
  }
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json(
      { error: 'message_too_long', message: `Max ${MAX_TTS_CHARS} chars; got ${text.length}.` },
      { status: 400 },
    )
  }

  // Auth: load the conversation and confirm it belongs to the current user.
  const conversationRel = (message as { conversationId?: unknown }).conversationId
  const conversationId = relIdOf(conversationRel)
  if (!conversationId) {
    return NextResponse.json({ error: 'message_orphan' }, { status: 400 })
  }
  const conversation = (await payload.findByID({
    collection: 'conversations',
    id: conversationId,
    depth: 1,
    overrideAccess: true,
  })) as Record<string, unknown> | null
  if (!conversation || conversation.deletedAt) {
    return NextResponse.json({ error: 'conversation_not_found' }, { status: 404 })
  }
  const convUserId = relIdOf((conversation as { userId?: unknown }).userId)
  if (String(convUserId) !== String(user.id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Cache hit — return the existing asset.
  const existingAudioRel = (message as { audioAssetId?: unknown }).audioAssetId
  if (existingAudioRel) {
    if (typeof existingAudioRel === 'object' && existingAudioRel !== null && 'publicUrl' in existingAudioRel) {
      const url = (existingAudioRel as { publicUrl?: string }).publicUrl
      if (url) {
        return NextResponse.json({
          ok: true,
          cached: true,
          audioUrl: url,
          mediaAssetId: (existingAudioRel as { id?: string | number }).id ?? null,
        })
      }
    }
    const id = relIdOf(existingAudioRel)
    if (id) {
      const asset = (await payload.findByID({
        collection: 'media-assets',
        id,
        overrideAccess: true,
      })) as Record<string, unknown> | null
      if (asset?.publicUrl) {
        return NextResponse.json({
          ok: true,
          cached: true,
          audioUrl: asset.publicUrl as string,
          mediaAssetId: id,
        })
      }
    }
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 })
  }

  // Premium gate. TTS is a paid-only feature: at ~$0.05 per playback an
  // unauthenticated free user could burn $5/day before hitting any other cap.
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [{ userId: { equals: user.id } }, { status: { equals: 'active' } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  const activeSub = subResult.docs[0]
  const planKey = (activeSub?.plan as PlanKey | undefined) ?? null
  if (!planKey || !isPremiumPlan(planKey)) {
    return NextResponse.json(
      { error: 'premium_required', message: 'Voice playback is a Premium feature.' },
      { status: 402 },
    )
  }

  // Daily TTS cap — Redis-bounded soft ceiling per plan tier. Checked before
  // spend so an over-cap user gets a clean 429 rather than burning a token
  // that we then have to refund. Counter increment happens AFTER spend
  // commits so a failed reserve doesn't consume cap headroom.
  const dailyCap = TTS_DAILY_CAP_BY_PLAN[planKey] ?? 0
  const capKey = ttsDayKey(user.id)
  const currentCount = ((await redis.get<number>(capKey)) ?? 0) as number
  if (currentCount >= dailyCap) {
    return NextResponse.json(
      {
        error: 'daily_cap_reached',
        message: `Daily voice playback cap of ${dailyCap} reached. Resets at 00:00 UTC.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(secondsUntilNextMidnightUTC()) },
      },
    )
  }

  // Resolve voice: character.voiceId → catalog default. Characters without a
  // voice still get a baseline voice so chat ▶ never fails for missing config.
  const characterRel = (conversation as { characterId?: unknown }).characterId
  const characterId = relIdOf(characterRel)
  let characterVoiceId: string | null = null
  if (characterId) {
    const character = (await payload.findByID({
      collection: 'characters',
      id: characterId,
      overrideAccess: true,
    })) as Record<string, unknown> | null
    if (character && typeof character.voiceId === 'string') {
      characterVoiceId = character.voiceId
    }
  }
  const voice = findVoiceById(characterVoiceId ?? '') ?? findVoiceById(DEFAULT_VOICE_ID)
  if (!voice) {
    return NextResponse.json({ error: 'voice_catalog_missing_default' }, { status: 500 })
  }

  // Token reservation. Idempotency keyed on the message so a retried POST
  // (network drop between fal call and JSON response) reuses the same debit
  // rather than charging twice. The cache-hit short-circuit above prevents a
  // separate "user already paid for this message" double-charge.
  const reserveKey = `tts:reserve:${messageId}`
  const refundKey = `tts:refund:tech:${messageId}`

  const balance = await getBalance(payload, user.id)
  if (balance < TTS_TOKEN_COST) {
    return NextResponse.json(
      {
        error: 'insufficient_tokens',
        message: `Voice playback costs ${TTS_TOKEN_COST} tokens.`,
        tokensRequired: TTS_TOKEN_COST,
        balance,
      },
      { status: 402 },
    )
  }

  const spendResult = await spend(payload, {
    userId: user.id,
    type: 'spend_voice_message',
    amount: TTS_TOKEN_COST,
    relatedMessageId: messageId,
    reason: 'tts_playback',
    idempotencyKey: reserveKey,
  })
  if (!spendResult.ok) {
    return NextResponse.json(
      {
        error: 'insufficient_tokens',
        message: `Voice playback costs ${TTS_TOKEN_COST} tokens.`,
        tokensRequired: TTS_TOKEN_COST,
      },
      { status: 402 },
    )
  }

  // Increment daily cap only on a fresh debit. spendResult.replayed === true
  // means we already charged for this messageId — the cap was already counted
  // on the original attempt, so don't double-count on retry.
  if (!spendResult.replayed) {
    await redis.incr(capKey)
    await redis.expire(capKey, secondsUntilNextMidnightUTC())
  }

  let result: Awaited<ReturnType<typeof generateSpeech>>
  try {
    result = await generateSpeech({
      text,
      voiceId: voice.providerVoiceId,
      endpoint: voice.endpoint,
    })
  } catch (err) {
    await autoRefund(payload, {
      userId: user.id,
      type: 'tech_refund',
      amount: TTS_TOKEN_COST,
      reason: `tts_failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 240),
      relatedMessageId: messageId,
      idempotencyKey: refundKey,
    })
    return NextResponse.json(
      { error: 'tts_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  let persisted: Awaited<ReturnType<typeof persistGeneratedAudio>>
  try {
    persisted = await persistGeneratedAudio({
      payload,
      fromUrl: result.audioUrl,
      contentType: result.contentType,
      durationSec: result.durationSec,
      kind: 'message-voice',
      ownerUserId: user.id,
      ownerCharacterId: characterId ?? undefined,
      relatedMessageId: messageId,
      generationMetadata: {
        voiceId: voice.id,
        providerVoiceId: voice.providerVoiceId,
        endpoint: voice.endpoint,
        requestId: result.requestId,
        latencyMs: result.latencyMs,
      },
    })
  } catch (err) {
    await autoRefund(payload, {
      userId: user.id,
      type: 'tech_refund',
      amount: TTS_TOKEN_COST,
      reason: `persist_failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 240),
      relatedMessageId: messageId,
      idempotencyKey: refundKey,
    })
    return NextResponse.json(
      { error: 'persist_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  try {
    await payload.update({
      collection: 'messages',
      id: messageId,
      data: { audioAssetId: persisted.mediaAssetId },
      overrideAccess: true,
    })
  } catch (err) {
    // Persisted asset survives even if the cache write fails — surface the
    // URL so the user still hears their playback. Next click will retry.
    console.warn('chat tts: failed to cache asset id on message', err)
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    audioUrl: persisted.publicUrl,
    mediaAssetId: persisted.mediaAssetId,
    durationSec: result.durationSec ?? null,
    voiceId: voice.id,
    latencyMs: result.latencyMs,
  })
}
