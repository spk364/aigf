import 'server-only'
import type { BasePayload } from 'payload'

// Per-character image gallery: every image the user has generated with a given
// character, across all of their conversations with it.
//
// Chat images are stored on media-assets with relatedMessageId + ownerUserId
// but NOT ownerCharacterId (see persist-generated-image.ts), so the link to the
// character runs message → conversation → characterId. We resolve it the other
// way for efficiency: conversations(user, character) → image messages →
// media-assets, all soft-delete-filtered.

export type GalleryItem = {
  id: string
  url: string
  width: number | null
  height: number | null
  createdAt: string | null
}

export type GetCharacterGalleryInput = {
  payload: BasePayload
  userId: string | number
  characterId: string | number
  limit?: number
}

function relId(rel: unknown): string | number | null {
  if (rel == null) return null
  if (typeof rel === 'object' && 'id' in (rel as object)) {
    return (rel as { id?: string | number }).id ?? null
  }
  return rel as string | number
}

export async function getCharacterGallery(
  input: GetCharacterGalleryInput,
): Promise<GalleryItem[]> {
  const { payload, userId, characterId, limit = 200 } = input

  // 1. Conversations for this (user, character) pair, not soft-deleted.
  const convos = await payload.find({
    collection: 'conversations',
    where: {
      and: [
        { userId: { equals: userId } },
        { characterId: { equals: characterId } },
        { deletedAt: { exists: false } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const convoIds = convos.docs.map((c) => c.id)
  if (convoIds.length === 0) return []

  // 2. Completed image messages in those conversations, newest first.
  const messages = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { in: convoIds.map(String) } },
        { type: { equals: 'image' } },
        { status: { equals: 'completed' } },
        { deletedAt: { exists: false } },
      ],
    },
    sort: '-createdAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const assetIds: (string | number)[] = []
  for (const msg of messages.docs) {
    const id = relId((msg as Record<string, unknown>).imageAssetId)
    if (id != null) assetIds.push(id)
  }
  if (assetIds.length === 0) return []

  // 3. Resolve the media-assets, dropping any that were soft-deleted (e.g. a
  //    safety-flagged image pulled after generation).
  const assets = await payload.find({
    collection: 'media-assets',
    where: {
      and: [
        { id: { in: assetIds.map(String) } },
        { deletedAt: { exists: false } },
      ],
    },
    limit: assetIds.length,
    depth: 0,
    overrideAccess: true,
  })

  const byId = new Map<string, (typeof assets.docs)[number]>()
  for (const a of assets.docs) byId.set(String(a.id), a)

  // Preserve message order (newest first) and skip assets that vanished.
  const items: GalleryItem[] = []
  for (const id of assetIds) {
    const a = byId.get(String(id))
    if (!a || !a.publicUrl) continue
    items.push({
      id: String(a.id),
      url: a.publicUrl as string,
      width: (a.width as number | null) ?? null,
      height: (a.height as number | null) ?? null,
      createdAt: (a.createdAt as string | null) ?? null,
    })
  }
  return items
}
