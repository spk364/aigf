// Memory backstop cron: run the memory job for conversations that went quiet
// with messages it hasn't processed yet.
//
// The chat route only triggers the job once MEMORY_BATCH_MESSAGES messages are
// past the checkpoint, so a session that ends a few turns into a batch leaves
// its tail unprocessed until the user comes back. That's harmless while it's
// still inside the history window, but it means the profile lags, and if the
// in-request run ever fails (after() not honoured, LLM timeout) nothing retries
// it until the next message. This sweep closes both gaps once a day.
//
// Auth: bearer CRON_SECRET, same contract as the other /api/cron routes.
export const maxDuration = 300

import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import * as Sentry from '@sentry/nextjs'
import config from '@payload-config'
import { createLogger } from '@/shared/lib/logger'
import { MIN_BATCH_MESSAGES, runMemoryJob } from '@/features/memory/memory-job'

const log = createLogger({ route: '/api/cron/process-memory' })

// Only conversations idle at least this long — an active session is handled by
// the chat route itself.
const IDLE_HOURS = 1
// Only look back this far. The cron runs daily, so anything older was already
// swept (or will never change again).
const LOOKBACK_DAYS = 7
const MAX_PER_RUN = 25
// Stop starting new jobs once this much of maxDuration is spent (each job is an
// LLM round-trip of several seconds).
const TIME_BUDGET_MS = 240_000

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

type DueRow = { id: number; user_id_id: number; character_id_id: number; language: string | null }

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const payload = await getPayload({ config })
    const pool = (payload.db as unknown as PostgresAdapter).pool

    // Raw SQL: "messages past this conversation's own checkpoint" compares two
    // columns, which Payload's where-clause can't express.
    const due = await pool.query<DueRow>(
      `SELECT c.id, c.user_id_id, c.character_id_id, c.language
       FROM conversations c
       WHERE c.deleted_at IS NULL
         AND c.user_id_id IS NOT NULL
         AND c.character_id_id IS NOT NULL
         AND c.last_message_at < now() - make_interval(hours => $1)
         AND c.last_message_at > now() - make_interval(days => $2)
         AND (
           SELECT count(*) FROM messages m
           WHERE m.conversation_id_id = c.id
             AND m.role IN ('user', 'assistant')
             AND m.deleted_at IS NULL
             AND m.is_regenerated IS NOT TRUE
             AND coalesce(m.content, '') <> ''
             AND m.id > coalesce(c.summary_up_to_message_id_id, 0)
         ) >= $3
       ORDER BY c.last_message_at DESC
       LIMIT $4`,
      [IDLE_HOURS, LOOKBACK_DAYS, MIN_BATCH_MESSAGES, MAX_PER_RUN],
    )

    const counts = { done: 0, skipped: 0, failed: 0 }
    for (const row of due.rows) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
      try {
        const res = await runMemoryJob({
          payload,
          conversationId: row.id,
          userId: row.user_id_id,
          characterId: row.character_id_id,
          language: row.language ?? 'en',
        })
        counts[res.status === 'done' ? 'done' : 'skipped']++
      } catch (err) {
        counts.failed++
        log.warn({ msg: 'cron.process_memory.job_failed', conversationId: row.id, err: String(err) })
      }
    }

    const summary = { due: due.rows.length, ...counts, durationMs: Date.now() - startedAt }
    log.info({ msg: 'cron.process_memory_done', ...summary })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    log.error({ msg: 'cron.process_memory_failed', err: String(err) })
    Sentry.captureException(err)
    return NextResponse.json({ error: 'process_memory_failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}
