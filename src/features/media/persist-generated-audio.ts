import 'server-only'
import type { BasePayload } from 'payload'
import { mirrorFromUrl, buildR2Key, getStorageProvider } from '@/shared/storage'

export type PersistGeneratedAudioInput = {
  payload: BasePayload
  fromUrl: string
  contentType: string
  durationSec?: number
  // Maps to media-assets `kind`. Voice clips reuse the existing
  // generated_video bucket conceptually but with their own values; we add
  // voice_preview / voice_message / character_voice_greeting in the
  // collection enum.
  kind: 'voice-preview' | 'character-voice-greeting' | 'message-voice'
  ownerUserId?: string | number
  ownerCharacterId?: string | number
  relatedMessageId?: string | number
  generationMetadata?: Record<string, unknown>
}

export type PersistGeneratedAudioResult = {
  mediaAssetId: string | number
  publicUrl: string
  storageKey: string
}

const KIND_MAP = {
  'voice-preview': 'voice_preview',
  'character-voice-greeting': 'character_voice_greeting',
  'message-voice': 'voice_message',
} as const satisfies Record<PersistGeneratedAudioInput['kind'], string>

// Map persistence kind → R2 key prefix. Distinct prefixes keep the bucket
// browsable and let lifecycle rules target voice clips separately.
const R2_KIND_MAP = {
  'voice-preview': 'voice-preview',
  'character-voice-greeting': 'character-voice-greeting',
  'message-voice': 'message-voice',
} as const

function coerceRelId<T extends string | number | undefined>(v: T): T {
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v) as T
  return v
}

function extFromContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim() ?? ''
  switch (normalized) {
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav'
    case 'audio/flac':
      return 'flac'
    case 'audio/ogg':
      return 'ogg'
    default:
      return 'mp3'
  }
}

export async function persistGeneratedAudio(
  input: PersistGeneratedAudioInput,
): Promise<PersistGeneratedAudioResult> {
  const ext = extFromContentType(input.contentType)

  const ownerUserId = coerceRelId(input.ownerUserId)
  const ownerCharacterId = coerceRelId(input.ownerCharacterId)
  const relatedMessageId = coerceRelId(input.relatedMessageId)

  const key = buildR2Key({
    kind: R2_KIND_MAP[input.kind],
    ownerId: ownerUserId,
    characterId: ownerCharacterId,
    messageId: relatedMessageId,
    ext,
  })

  const uploadResult = await mirrorFromUrl({
    sourceUrl: input.fromUrl,
    destKey: key,
  })

  const doc = await input.payload.create({
    collection: 'media-assets',
    data: {
      kind: KIND_MAP[input.kind],
      storageKey: uploadResult.key,
      storageProvider: getStorageProvider(),
      publicUrl: uploadResult.publicUrl,
      mimeType: uploadResult.contentType,
      sizeBytes: uploadResult.sizeBytes,
      durationSec: input.durationSec,
      ownerUserId,
      ownerCharacterId,
      relatedMessageId,
      generationMetadata: input.generationMetadata ?? null,
      moderationStatus: 'approved',
      isNsfw: false,
    },
  })

  return {
    mediaAssetId: doc.id,
    publicUrl: uploadResult.publicUrl,
    storageKey: uploadResult.key,
  }
}
