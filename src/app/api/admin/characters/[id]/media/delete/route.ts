export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

const bodySchema = z.object({
  mediaAssetId: z.union([z.string(), z.number()]),
})

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

function relId(rel: unknown): string | number | null {
  if (rel == null) return null
  if (typeof rel === 'object' && rel !== null) {
    const obj = rel as { id?: string | number }
    return obj.id ?? null
  }
  return rel as string | number
}

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

  const { id: characterId } = await params
  const payload = await getPayload({ config })
  const characterIdCoerced = coerceRelId(characterId)
  const mediaAssetIdCoerced = coerceRelId(body.mediaAssetId)

  let asset: Record<string, unknown> | null = null
  try {
    asset = (await payload.findByID({
      collection: 'media-assets',
      id: mediaAssetIdCoerced,
      overrideAccess: true,
      depth: 0,
    })) as Record<string, unknown> | null
  } catch {
    return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })
  }

  // Soft-delete the asset.
  try {
    await payload.update({
      collection: 'media-assets',
      id: mediaAssetIdCoerced,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'delete_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // If this asset was the character's primary or reference, unlink it so the
  // gallery doesn't show stale pointers to a tombstoned row.
  let character: Record<string, unknown> | null = null
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterIdCoerced,
      overrideAccess: true,
      depth: 0,
    })) as Record<string, unknown> | null
  } catch {
    character = null
  }

  if (character) {
    const updates: Record<string, unknown> = {}
    if (
      relId(character.primaryImageId) != null &&
      String(relId(character.primaryImageId)) === String(mediaAssetIdCoerced)
    ) {
      updates.primaryImageId = null
    }
    if (
      relId(character.referenceImageId) != null &&
      String(relId(character.referenceImageId)) === String(mediaAssetIdCoerced)
    ) {
      updates.referenceImageId = null
      updates.referenceImageUrl = null
    }
    if (Object.keys(updates).length > 0) {
      try {
        await payload.update({
          collection: 'characters',
          id: characterIdCoerced,
          data: updates,
          overrideAccess: true,
        })
      } catch {
        // Best-effort — the asset is already deleted; cleaning the FK is a
        // nice-to-have.
      }
    }
  }

  return NextResponse.json({ ok: true })
}
