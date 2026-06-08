export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

// Admin: manage a character's chat-backdrop candidates.
//   GET  → list character_backdrop assets + the currently active URL.
//   POST → { action: 'activate' | 'delete' | 'clear', mediaAssetId? }.
// Authenticated-only, matching the other /api/admin/characters/* routes.

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

export type BackdropItem = {
  id: string | number
  url: string
  width: number | null
  height: number | null
  createdAt: string | null
  isActive: boolean
}

async function loadCharacter(payload: Awaited<ReturnType<typeof getPayload>>, id: string | number) {
  return (await payload
    .findByID({ collection: 'characters', id, overrideAccess: true, depth: 0 })
    .catch(() => null)) as Record<string, unknown> | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const characterId = coerceRelId(id)
  const payload = await getPayload({ config })

  const character = await loadCharacter(payload, characterId)
  const activeUrl =
    character && typeof character.chatBackdropUrl === 'string' ? character.chatBackdropUrl : null

  const result = await payload.find({
    collection: 'media-assets',
    where: {
      and: [
        { ownerCharacterId: { equals: characterId } },
        { kind: { equals: 'character_backdrop' } },
        { deletedAt: { exists: false } },
      ],
    },
    sort: '-createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const items: BackdropItem[] = result.docs
    .map((d) => {
      const doc = d as Record<string, unknown>
      const url = typeof doc.publicUrl === 'string' ? doc.publicUrl : ''
      return {
        id: doc.id as string | number,
        url,
        width: typeof doc.width === 'number' ? doc.width : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
        isActive: !!activeUrl && url === activeUrl,
      }
    })
    .filter((i) => i.url.length > 0)

  return NextResponse.json({ items, activeUrl })
}

const postSchema = z.object({
  action: z.enum(['activate', 'delete', 'clear']),
  mediaAssetId: z.union([z.string(), z.number()]).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    )
  }

  const { id } = await params
  const characterId = coerceRelId(id)
  const payload = await getPayload({ config })

  if (body.action === 'clear') {
    await payload.update({
      collection: 'characters',
      id: characterId,
      data: { chatBackdropUrl: null },
      overrideAccess: true,
    })
    return NextResponse.json({ ok: true, activeUrl: null })
  }

  if (!body.mediaAssetId) {
    return NextResponse.json({ error: 'media_asset_id_required' }, { status: 400 })
  }
  const assetId = coerceRelId(body.mediaAssetId)

  // The asset must be a backdrop belonging to this character.
  const asset = (await payload
    .findByID({ collection: 'media-assets', id: assetId, overrideAccess: true, depth: 0 })
    .catch(() => null)) as Record<string, unknown> | null
  if (!asset) return NextResponse.json({ error: 'media_asset_not_found' }, { status: 404 })
  const ownerId =
    asset.ownerCharacterId && typeof asset.ownerCharacterId === 'object'
      ? (asset.ownerCharacterId as { id?: string | number }).id
      : asset.ownerCharacterId
  if (asset.kind !== 'character_backdrop' || String(ownerId) !== String(characterId)) {
    return NextResponse.json({ error: 'not_a_backdrop_for_this_character' }, { status: 400 })
  }
  const url = typeof asset.publicUrl === 'string' ? asset.publicUrl : ''

  if (body.action === 'activate') {
    if (!url) return NextResponse.json({ error: 'asset_missing_url' }, { status: 400 })
    await payload.update({
      collection: 'characters',
      id: characterId,
      data: { chatBackdropUrl: url },
      overrideAccess: true,
    })
    return NextResponse.json({ ok: true, activeUrl: url })
  }

  // delete: soft-delete the asset; if it was the active backdrop, clear it.
  await payload.update({
    collection: 'media-assets',
    id: assetId,
    data: { deletedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  const character = await loadCharacter(payload, characterId)
  const wasActive =
    character && typeof character.chatBackdropUrl === 'string' && character.chatBackdropUrl === url
  if (wasActive) {
    await payload.update({
      collection: 'characters',
      id: characterId,
      data: { chatBackdropUrl: null },
      overrideAccess: true,
    })
  }
  return NextResponse.json({ ok: true, activeCleared: !!wasActive })
}
