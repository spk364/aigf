// Storage-hygiene cron: hard-delete soft-deleted messages past their retention
// window.
//
// "Clear history" (conversations/[id]/clear) and message removal soft-delete
// rows (deletedAt stamp) so the request is instant and reversible in support
// scenarios — but nothing ever purged them, so cleared transcripts accumulated
// in the messages table forever. Every hot query filters `deletedAt exists
// false`, meaning these rows are pure dead weight: never rendered, never fed to
// the LLM, only widening the table and its indexes.
//
// Retention: 30 days after soft-deletion, then gone for good. Media messages
// are NOT deleted here even when soft-deleted — their media-assets rows manage
// the R2 object lifecycle; we only drop the message rows.
//
// Auth: bearer CRON_SECRET, same contract as the other /api/cron routes.
export const maxDuration = 300

import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import * as Sentry from '@sentry/nextjs'
import config from '@payload-config'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ route: '/api/cron/purge-deleted-messages' })

const RETENTION_DAYS = 30

// Per-run cap so a huge backlog can't blow the function's time budget; the
// daily schedule drains any remainder on subsequent runs.
const MAX_PER_RUN = 5000

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const payload = await getPayload({ config })
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Fetch ids first (cheap, indexed on deletedAt), then bulk-delete by id —
    // keeps the delete bounded and lets us report an accurate count.
    const due = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { deletedAt: { less_than: cutoff } },
          // Keep media rows: the gallery + media-assets lifecycle own those.
          { type: { not_in: ['image', 'video'] } },
        ],
      },
      limit: MAX_PER_RUN,
      depth: 0,
      select: { deletedAt: true },
      overrideAccess: true,
    })

    let purged = 0
    if (due.docs.length > 0) {
      await payload.delete({
        collection: 'messages',
        where: { id: { in: due.docs.map((d) => d.id) } },
        overrideAccess: true,
      })
      purged = due.docs.length
    }

    const summary = {
      purgedMessages: purged,
      backlogRemaining: Math.max(0, due.totalDocs - purged),
      durationMs: Date.now() - startedAt,
    }
    log.info({ msg: 'cron.purge_messages_done', ...summary })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    log.error({ msg: 'cron.purge_messages_failed', err: String(err) })
    Sentry.captureException(err)
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}
