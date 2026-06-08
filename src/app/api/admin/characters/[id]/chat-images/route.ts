export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

// Admin-only: list images USERS generated with this character in chat. Unlike
// admin-generated media (ownerCharacterId on media-assets), chat images are
// owned by the user and linked to the character only through
// message → conversation → characterId — so we resolve them that way.

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

function relId(rel: unknown): string | number | null {
  if (rel == null) return null
  if (typeof rel === 'object' && rel !== null) return (rel as { id?: string | number }).id ?? null
  return rel as string | number
}

export type ChatImageItem = {
  id: string | number
  url: string
  width: number | null
  height: number | null
  createdAt: string | null
  userId: string | number | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const roles = (user as { roles?: string[] }).roles ?? []
  if (!roles.includes('admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  const characterId = coerceRelId(id)
  const payload = await getPayload({ config })

  try {
    // 1. Conversations with this character (any user), not soft-deleted.
    const convos = await payload.find({
      collection: 'conversations',
      where: {
        and: [
          { characterId: { equals: characterId } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    if (convos.docs.length === 0) return NextResponse.json({ items: [] })

    const userByConvo = new Map<string, string | number | null>()
    for (const c of convos.docs) userByConvo.set(String(c.id), relId((c as Record<string, unknown>).userId))
    const convoIds = convos.docs.map((c) => c.id)

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
      limit: 300,
      depth: 0,
      overrideAccess: true,
    })

    type Pending = { assetId: string | number; userId: string | number | null }
    const pending: Pending[] = []
    for (const m of messages.docs) {
      const doc = m as Record<string, unknown>
      const assetId = relId(doc.imageAssetId)
      if (assetId == null) continue
      pending.push({ assetId, userId: userByConvo.get(String(relId(doc.conversationId))) ?? null })
    }
    if (pending.length === 0) return NextResponse.json({ items: [] })

    // 3. Resolve assets, dropping soft-deleted (e.g. safety-pulled) ones.
    const assets = await payload.find({
      collection: 'media-assets',
      where: {
        and: [
          { id: { in: pending.map((p) => String(p.assetId)) } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: pending.length,
      depth: 0,
      overrideAccess: true,
    })
    const byId = new Map<string, Record<string, unknown>>()
    for (const a of assets.docs) byId.set(String(a.id), a as Record<string, unknown>)

    const items: ChatImageItem[] = []
    for (const p of pending) {
      const a = byId.get(String(p.assetId))
      if (!a || !a.publicUrl) continue
      items.push({
        id: a.id as string | number,
        url: a.publicUrl as string,
        width: typeof a.width === 'number' ? a.width : null,
        height: typeof a.height === 'number' ? a.height : null,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : null,
        userId: p.userId,
      })
    }

    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: 'list_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
