export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { removeBackground } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'

// Admin: turn an existing gallery image into the chat backdrop standee.
//
// The chat standee is a transparent PNG (faded into the chat on desktop), so we
// can't just point chatBackdropUrl at a raw scene photo — its rectangular
// background would show. Instead we cut the background out (fal BiRefNet),
// persist the cutout as a character_backdrop asset, and activate it. Same tail
// as generate-backdrop, but starting from an image the admin already has rather
// than generating a new one.
// Authenticated-only, matching the other /api/admin/characters/* routes.

const bodySchema = z.object({
  mediaAssetId: z.union([z.string(), z.number()]),
})

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    )
  }

  const { id } = await params
  const characterId = coerceRelId(id)
  const assetId = coerceRelId(body.mediaAssetId)
  const payload = await getPayload({ config })

  // The source image must exist, have a URL, and belong to this character.
  const asset = (await payload
    .findByID({ collection: 'media-assets', id: assetId, overrideAccess: true, depth: 0 })
    .catch(() => null)) as Record<string, unknown> | null
  if (!asset) return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })

  const ownerId =
    asset.ownerCharacterId && typeof asset.ownerCharacterId === 'object'
      ? (asset.ownerCharacterId as { id?: string | number }).id
      : asset.ownerCharacterId
  if (String(ownerId) !== String(characterId)) {
    return NextResponse.json({ error: 'asset_not_for_this_character' }, { status: 400 })
  }
  const sourceUrl = typeof asset.publicUrl === 'string' ? asset.publicUrl : ''
  if (!sourceUrl) return NextResponse.json({ error: 'asset_missing_url' }, { status: 400 })

  try {
    // Cut the background out → transparent PNG standee.
    const cutout = await removeBackground(sourceUrl)

    const persisted = await persistGeneratedImage({
      payload,
      fromUrl: cutout.url,
      width: cutout.width,
      height: cutout.height,
      contentType: cutout.contentType,
      kind: 'character-backdrop',
      ownerCharacterId: characterId,
      generationMetadata: { source: 'chat-backdrop-from-gallery', fromMediaAssetId: assetId },
    })

    await payload.update({
      collection: 'characters',
      id: characterId,
      data: { chatBackdropUrl: persisted.publicUrl },
      overrideAccess: true,
    })

    return NextResponse.json({
      ok: true,
      url: persisted.publicUrl,
      mediaAssetId: persisted.mediaAssetId,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'set_backdrop_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
