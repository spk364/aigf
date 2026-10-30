// Clear a conversation's text history without touching generated photos.
//
// "Start fresh" for a single thread: soft-deletes the text transcript (and any
// non-media rows) so the next message begins with a clean LLM context, while
// image/video messages are preserved — they stay visible in the per-character
// gallery (getCharacterGallery filters on type='image' + deletedAt) and in the
// chat. We also drop the rolling summary, which is the other context carrier;
// long-term memory (profile + episodic memories) is intentionally left intact —
// and before the transcript goes, its not-yet-processed tail is handed to the
// memory job so whatever the user said since the last run isn't lost with it.

export const maxDuration = 30

import { NextRequest, NextResponse, after } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { loadUnprocessedMessages, relId, runMemoryJob } from '@/features/memory/memory-job'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ route: '/api/chat/conversations/[id]/clear' })

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

  // Snapshot the messages the memory job hasn't seen yet — they're about to be
  // soft-deleted, and the checkpoint reset below would otherwise skip them.
  const unprocessed = await loadUnprocessedMessages(
    payload,
    conversationId,
    relId(conversation.summaryUpToMessageId),
  ).catch(() => [])

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

  const characterId = relId(conversation.characterId)
  if (unprocessed.length > 0 && characterId !== null) {
    after(async () => {
      try {
        await runMemoryJob({
          payload,
          conversationId,
          userId: user.id,
          characterId,
          language: (conversation.language as string | null) ?? 'en',
          messages: unprocessed,
        })
      } catch (err: unknown) {
        log.warn({ msg: 'memory.job.flush_failed', conversationId, err: err instanceof Error ? err.message : err })
      }
    })
  }

  const clearedCount = Array.isArray(result.docs) ? result.docs.length : 0
  return NextResponse.json({ ok: true, clearedCount })
}
