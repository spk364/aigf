// GDPR erasure cron (Art. 17). Hard-deletes personal data + anonymizes the
// users row for accounts soft-deleted more than 90 days ago, while retaining
// legally-required financial/compliance records (see features/gdpr/data-map.ts).
//
// Auth: bearer CRON_SECRET, same contract as /api/cron/validate-balances.
// Returns 200 with a summary even when nothing was due. A 500 means the job is
// broken and should page someone.
export const maxDuration = 300

import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import * as Sentry from '@sentry/nextjs'
import config from '@payload-config'
import { purgeExpiredDeletedUsers } from '@/features/gdpr/purge'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ route: '/api/cron/purge-deleted-users' })

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
    const results = await purgeExpiredDeletedUsers(payload)

    const summary = {
      purgedUsers: results.length,
      r2ObjectsDeleted: results.reduce((n, r) => n + r.r2ObjectsDeleted, 0),
      messagesDeleted: results.reduce((n, r) => n + r.messagesDeleted, 0),
      durationMs: Date.now() - startedAt,
    }
    log.info({ msg: 'cron.purge_done', ...summary })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    log.error({ msg: 'cron.purge_failed', err: String(err) })
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
