// Per-conversation character gallery for the in-chat overlay. Mirrors the
// /chat/[id]/gallery server page, but returns JSON so the gallery can open over
// the chat without a navigation. Ownership is enforced (conversation → userId).

export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { getCharacterGallery } from '@/features/media/character-gallery'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params
  if (!conversationId) {
    return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  }

  const payload = await getPayload({ config })

  const conversation = await payload
    .findByID({ collection: 'conversations', id: conversationId })
    .catch(() => null)
  if (!conversation || conversation.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId
  if (String(convUserId) !== String(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const characterId =
    typeof conversation.characterId === 'object' && conversation.characterId !== null
      ? (conversation.characterId as { id: string | number }).id
      : (conversation.characterId as string | number | undefined)
  if (!characterId) return NextResponse.json({ items: [] })

  const items = await getCharacterGallery({ payload, userId: user.id, characterId })
  return NextResponse.json({ items })
}
