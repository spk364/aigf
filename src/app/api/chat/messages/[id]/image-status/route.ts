// Poll endpoint for in-flight chat image generation. The chat /api/chat
// endpoint submits a fal job and returns immediately; the client polls
// here every 2s until phase !== 'pending'. See features/chat/image-job.ts.

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { finalizeChatImageJob } from '@/features/chat/image-job'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: messageId } = await params
  if (!messageId) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 })
  }

  const payload = await getPayload({ config })

  const result = await finalizeChatImageJob({
    payload,
    messageId,
    userId: user.id,
  })

  if (result.phase === 'not_found') {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }
  if (result.phase === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(result)
}
