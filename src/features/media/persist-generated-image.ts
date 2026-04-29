import 'server-only'
import type { BasePayload } from 'payload'
import { mirrorFromUrl, buildR2Key, getStorageProvider } from '@/shared/storage'

export type PersistGeneratedImageInput = {
  payload: BasePayload
  fromUrl: string
  width: number
  height: number
  contentType: string
  kind: 'character-reference' | 'character-gallery' | 'character-preview' | 'message-image'
  ownerUserId?: string | number
  ownerCharacterId?: string | number
  relatedMessageId?: string | number
  generationMetadata?: Record<string, unknown>
}

export type PersistGeneratedImageResult = {
  mediaAssetId: string | number
  publicUrl: string
  storageKey: string
}

// Maps the input kind to the media-assets collection enum value.
const KIND_MAP = {
  'character-reference': 'character_reference',
  'character-gallery': 'character_gallery',
  'character-preview': 'character_preview',
  'message-image': 'generated_message',
} as const satisfies Record<PersistGeneratedImageInput['kind'], string>

// Derives a file extension from a MIME type string.
function extFromContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim() ?? ''
  switch (normalized) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/avif':
      return 'avif'
    default:
      return 'bin'
  }
}

export async function persistGeneratedImage(
  input: PersistGeneratedImageInput,
): Promise<PersistGeneratedImageResult> {
  const ext = extFromContentType(input.contentType)

  const key = buildR2Key({
    kind: input.kind,
    ownerId: input.ownerUserId,
    characterId: input.ownerCharacterId,
    messageId: input.relatedMessageId,
    ext,
  })

  // Mirror from fal CDN to R2.
  const uploadResult = await mirrorFromUrl({
    sourceUrl: input.fromUrl,
    destKey: key,
  })

  // Create the media-assets row via Payload.
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
