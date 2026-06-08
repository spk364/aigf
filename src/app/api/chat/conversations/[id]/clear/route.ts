// Clear a conversation's text history without touching generated photos.
//
// "Start fresh" for a single thread: soft-deletes the text transcript (and any
// non-media rows) so the next message begins with a clean LLM context, while
// image/video messages are preserved — they stay visible in the per-character
// gallery (getCharacterGallery filters on type='image' + deletedAt) and in the
// chat. We also drop the rolling summary, which is the other context carrier;
// long-term cross-conversation memories are intentionally left intact.

export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

// Message types that carry generated media we want to keep. Everything else
// (text, voice, action, request rows) is part of the conversational history and
// gets cleared.
const KEEP_TYPES = ['image', 'video'] as const

export async function POST(
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

  const now = new Date().toISOString()

  // Soft-delete every non-media message still live in this conversation.
  const result = (await payload.update({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { type: { not_in: [...KEEP_TYPES] } },
        { deletedAt: { exists: false } },
      ],
    } as never,
    data: { deletedAt: now } as never,
    overrideAccess: true,
  })) as { docs?: unknown[] }

  // Drop the rolling summary so it can't reinject the just-cleared context.
  // Leave long-term memories alone — those are the cross-conversation "she
  // remembers you" layer, not this thread's transcript.
  await payload.update({
    collection: 'conversations',
    id: conversationId,
    data: {
      summary: null,
      summaryUpToMessageId: null,
      summaryUpdatedAt: null,
      lastMessagePreview: null,
    } as never,
    overrideAccess: true,
  })

  const clearedCount = Array.isArray(result.docs) ? result.docs.length : 0
  return NextResponse.json({ ok: true, clearedCount })
}
