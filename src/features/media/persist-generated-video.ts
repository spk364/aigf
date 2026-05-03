import 'server-only'
import type { BasePayload } from 'payload'
import { mirrorFromUrl, buildR2Key, getStorageProvider } from '@/shared/storage'

export type PersistGeneratedVideoInput = {
  payload: BasePayload
  fromUrl: string
  contentType: string
  durationSec?: number
  width?: number
  height?: number
  kind: 'character-video' | 'message-video'
  ownerUserId?: string | number
  ownerCharacterId?: string | number
  relatedMessageId?: string | number
  generationMetadata?: Record<string, unknown>
}

export type PersistGeneratedVideoResult = {
  mediaAssetId: string | number
  publicUrl: string
  storageKey: string
}

const KIND_MAP = {
  'character-video': 'generated_video',
  'message-video': 'generated_video',
} as const satisfies Record<PersistGeneratedVideoInput['kind'], string>

function extFromContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim() ?? ''
  switch (normalized) {
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    default:
      return 'mp4'
  }
}

export async function persistGeneratedVideo(
  input: PersistGeneratedVideoInput,
): Promise<PersistGeneratedVideoResult> {
  const ext = extFromContentType(input.contentType)

  const key = buildR2Key({
    kind: input.kind,
    ownerId: input.ownerUserId,
    characterId: input.ownerCharacterId,
    messageId: input.relatedMessageId,
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
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
      ownerUserId: input.ownerUserId,
      ownerCharacterId: input.ownerCharacterId,
      relatedMessageId: input.relatedMessageId,
      generationMetadata: input.generationMetadata ?? null,
      moderationStatus: 'pending',
      isNsfw: false,
    },
  })

  return {
    mediaAssetId: doc.id,
    publicUrl: uploadResult.publicUrl,
    storageKey: uploadResult.key,
  }
}
