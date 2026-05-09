// Synchronous TTS — MiniMax Speech-02 HD typically returns in 3-15 s for
// greeting-length text (≤300 chars). Cap maxDuration well below Vercel
// Hobby's 60 s ceiling.
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import {
  generateSpeech,
  TTS_ENDPOINT_MINIMAX_SPEECH_02_HD,
  TTS_ENDPOINT_MINIMAX_SPEECH_02_TURBO,
  type TTSEndpoint,
} from '@/shared/ai/tts'
import { findVoiceById, DEFAULT_VOICE_ID } from '@/shared/ai/voice-catalog'
import { persistGeneratedAudio } from '@/features/media/persist-generated-audio'

const VALID_ENDPOINTS = [
  TTS_ENDPOINT_MINIMAX_SPEECH_02_HD,
  TTS_ENDPOINT_MINIMAX_SPEECH_02_TURBO,
] as const

const bodySchema = z.object({
  // The greeting line. Kept short — long form belongs in chat, not on the card.
  text: z.string().min(1).max(600),
  // Voice catalog id; falls back to character.voiceId or DEFAULT_VOICE_ID.
  voiceId: z.string().min(1).max(64).optional(),
  // TTS endpoint override. Default = MiniMax Speech-02 HD.
  endpoint: z.enum(VALID_ENDPOINTS).optional(),
  // Save the result on character.greetingAudioAssetId (true) or just return
  // the URL for preview without persisting (false).
  persist: z.boolean().default(true),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    )
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 })
  }

  const { id: characterId } = await params
  const payload = await getPayload({ config })

  let character: Record<string, unknown>
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterId,
      overrideAccess: true,
    })) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }
  if (!character || character.deletedAt) {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  // Resolve voice: explicit body override → character config → catalog default.
  const requestedVoiceId =
    body.voiceId ?? (typeof character.voiceId === 'string' ? character.voiceId : null)
  const voice = findVoiceById(requestedVoiceId ?? '') ?? findVoiceById(DEFAULT_VOICE_ID)
  if (!voice) {
    return NextResponse.json({ error: 'voice_catalog_missing_default' }, { status: 500 })
  }

  // Endpoint may be specified by the admin (HD vs Turbo trade-off). Otherwise
  // use the one declared on the catalog entry — keeps voice-specific tuning
  // honored without per-call overrides.
  const endpoint: TTSEndpoint = body.endpoint ?? (voice.endpoint as TTSEndpoint)

  let result: Awaited<ReturnType<typeof generateSpeech>>
  try {
    result = await generateSpeech({
      text: body.text,
      voiceId: voice.providerVoiceId,
      endpoint,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'tts_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  if (!body.persist) {
    return NextResponse.json({
      ok: true,
      preview: true,
      audioUrl: result.audioUrl,
      durationSec: result.durationSec ?? null,
      voiceId: voice.id,
      endpoint,
      latencyMs: result.latencyMs,
    })
  }

  let persisted: Awaited<ReturnType<typeof persistGeneratedAudio>>
  try {
    persisted = await persistGeneratedAudio({
      payload,
      fromUrl: result.audioUrl,
      contentType: result.contentType,
      durationSec: result.durationSec,
      kind: 'character-voice-greeting',
      ownerCharacterId: characterId,
      generationMetadata: {
        voiceId: voice.id,
        providerVoiceId: voice.providerVoiceId,
        endpoint,
        text: body.text,
        requestId: result.requestId,
        latencyMs: result.latencyMs,
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'persist_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // Persist voiceId on the character if it changed — admins picking a new
  // voice and clicking generate-greeting expect the character to remember it.
  const updatePayload: Record<string, unknown> = {
    greetingAudioAssetId: persisted.mediaAssetId,
  }
  if (character.voiceId !== voice.id) {
    updatePayload.voiceId = voice.id
  }

  try {
    await payload.update({
      collection: 'characters',
      id: characterId,
      data: updatePayload,
      overrideAccess: true,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'character_update_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    audioUrl: persisted.publicUrl,
    mediaAssetId: persisted.mediaAssetId,
    durationSec: result.durationSec ?? null,
    voiceId: voice.id,
    endpoint,
    latencyMs: result.latencyMs,
  })
}
