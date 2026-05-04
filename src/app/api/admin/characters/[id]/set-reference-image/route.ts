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

  let asset: { publicUrl?: string } | null = null
  try {
    asset = (await payload.findByID({
      collection: 'media-assets',
      id: mediaAssetIdCoerced,
      overrideAccess: true,
    })) as { publicUrl?: string } | null
  } catch {
    return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })
  }
  if (!asset) {
    return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })
  }

  try {
    await payload.update({
      collection: 'characters',
      id: characterIdCoerced,
      data: {
        referenceImageId: mediaAssetIdCoerced,
        referenceImageUrl: asset.publicUrl ?? null,
      },
      overrideAccess: true,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'update_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    mediaAssetId: mediaAssetIdCoerced,
    publicUrl: asset.publicUrl ?? null,
  })
}
