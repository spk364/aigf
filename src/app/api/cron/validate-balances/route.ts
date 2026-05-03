import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import * as Sentry from '@sentry/nextjs'
import config from '@payload-config'
import { validateBalances } from '@/features/tokens/validator'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ route: '/api/cron/validate-balances' })

/**
 * Daily token-balance reconciliation (03:00 UTC, Vercel Hobby's minimum
 * granularity is once-per-day). Compares cached `token_balances.balance`
 * against the SUM of `token_transactions.amount` per user; on any mismatch
 * raises a Sentry issue and writes an audit-log row pointing at the affected
 * user so an admin can investigate. Move to hourly once on a paid Vercel plan.
 *
 * Auth: bearer token must match `CRON_SECRET`. Vercel Cron sends this header
 * automatically when the route is registered in `vercel.json`. The same
 * endpoint can also be hit by Inngest later — the auth contract is provider-
 * agnostic.
 *
 * The handler returns 200 even when discrepancies are found, because the
 * reconciliation itself succeeded. A 500 means the cron job is broken and
 * should page someone.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${expected}`
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const startedAt = Date.now()

  try {
    const { ok, discrepancies } = await validateBalances(payload)
    const durationMs = Date.now() - startedAt

    if (!ok) {
      log.error({
        msg: 'token_balance_validator.discrepancies_found',
        count: discrepancies.length,
        sample: discrepancies.slice(0, 5),
      })

      Sentry.captureMessage('token_balance_discrepancy', {
        level: 'error',
        extra: { count: discrepancies.length, discrepancies: discrepancies.slice(0, 50) },
      })

      // Audit row per user so admin UI can filter quickly. Limit fan-out: if
      // the validator returns hundreds of mismatches we have a bigger problem
      // than audit-log volume, so logging each is correct.
      for (const d of discrepancies) {
        await payload.create({
          collection: 'audit-logs',
          data: {
            actorType: 'system',
            actorId: 'cron-validator',
            action: 'token_balance.discrepancy',
            entityType: 'token-balances',
            entityId: String(d.userId),
            changes: { cached: d.cached, expected: d.expected, delta: d.expected - d.cached },
            reason: 'hourly cron validator detected balance/ledger mismatch',
          },
          overrideAccess: true,
        }).catch((err: unknown) => {
          log.error({ msg: 'token_balance_validator.audit_write_failed', userId: d.userId, err })
        })
      }
    } else {
      log.info({ msg: 'token_balance_validator.ok', durationMs })
    }

    return NextResponse.json({
      ok,
      discrepancyCount: discrepancies.length,
      durationMs,
    })
  } catch (err) {
    log.error({ msg: 'token_balance_validator.failed', err })
    Sentry.captureException(err, { tags: { source: 'cron-validate-balances' } })
    return NextResponse.json({ error: 'validator_failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}
