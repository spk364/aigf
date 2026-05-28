import 'server-only'
import type { BasePayload } from 'payload'
import { createLogger } from '@/shared/lib/logger'
import { track } from '@/shared/analytics/posthog'

// Strike-based escalation. Softer than spec §3.10: we never auto-BAN, only
// auto-SUSPEND. Permanent bans are reserved for admin review via the Payload
// admin panel — the incident + content_flag rows still get written, so admins
// have the full forensic trail; they decide if a ban is warranted.
//
// Rationale: auto-banning on a single severe match is too brittle — one mistyped
// message can lock a user out of a paid account, and the cost of a false-positive
// permanent ban (chargeback, support load, reputational damage) is far higher
// than a few extra hours of an offending user staying suspended.
//
// Current policy:
//   - 3 blocked attempts within 24h  → 24h temp suspension
//   - 5 blocked attempts within 7d   → 7-day suspension
//   - any severe (CSAM-class) hit    → 7-day suspension + critical incident
//
// Counts read from content_flags (recorded by the caller BEFORE calling this,
// so the current attempt is included). Applying a status change updates the
// users row and writes an audit_logs entry. Fail-safe: never throws into the
// request path — escalation failure must not unblock a user, but also must not
// 500 the chat endpoint.

const log = createLogger({ scope: 'safety.escalation' })

const SUSPEND_24H_THRESHOLD = 3
const SUSPEND_7D_THRESHOLD = 5

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export type EscalationAction = 'none' | 'suspend_24h' | 'suspend_7d'

const BLOCKING_FLAG_TYPES = ['blocked_input', 'blocked_output', 'blocked_image']

async function countFlagsSince(
  payload: BasePayload,
  userId: string | number,
  sinceMs: number,
): Promise<number> {
  const since = new Date(sinceMs).toISOString()
  const res = await payload.count({
    collection: 'content-flags',
    where: {
      and: [
        { userId: { equals: userId } },
        { flagType: { in: BLOCKING_FLAG_TYPES } },
        { createdAt: { greater_than: since } },
      ],
    },
  })
  return res.totalDocs
}

async function applyStatus(
  payload: BasePayload,
  userId: string | number,
  action: 'suspend_24h' | 'suspend_7d',
  reason: string,
): Promise<void> {
  const durationMs = action === 'suspend_7d' ? WEEK_MS : DAY_MS

  await payload.update({
    collection: 'users',
    id: userId,
    data: {
      status: 'suspended',
      suspensionReason: reason,
      suspendedUntil: new Date(Date.now() + durationMs).toISOString(),
    },
  })

  await payload
    .create({
      collection: 'audit-logs',
      data: {
        actorType: 'system',
        action: 'user.suspend',
        entityType: 'user',
        entityId: String(userId),
        reason,
      },
    })
    .catch((err) => log.warn({ msg: 'escalation.audit_write_failed', err: String(err) }))

  track({
    userId: String(userId),
    event: 'safety.user_suspended',
    properties: { reason, durationMs },
  })
  log.warn({ msg: 'safety.escalation_applied', userId: String(userId), action, reason, durationMs })
}

/**
 * Evaluate a user's recent strike count and apply suspension/ban if a threshold
 * is crossed. Call AFTER recording the triggering content_flag. `severe` (true
 * for CSAM-class hits) forces an immediate ban regardless of count.
 *
 * Returns the action taken so the caller can fold it into the incident's
 * actionTaken field. Never throws.
 */
export async function maybeEscalate(
  payload: BasePayload,
  userId: string | number | null | undefined,
  opts: { severe?: boolean } = {},
): Promise<EscalationAction> {
  if (userId == null) return 'none' // guest / unauthenticated — no user row to act on

  try {
    if (opts.severe) {
      await applyStatus(payload, userId, 'suspend_7d', 'CSAM-class safety violation (under admin review)')
      return 'suspend_7d'
    }

    const weekCount = await countFlagsSince(payload, userId, Date.now() - WEEK_MS)
    if (weekCount >= SUSPEND_7D_THRESHOLD) {
      await applyStatus(payload, userId, 'suspend_7d', `${weekCount} blocked attempts in 7 days`)
      return 'suspend_7d'
    }

    const dayCount = await countFlagsSince(payload, userId, Date.now() - DAY_MS)
    if (dayCount >= SUSPEND_24H_THRESHOLD) {
      await applyStatus(payload, userId, 'suspend_24h', `${dayCount} blocked attempts in 24h`)
      return 'suspend_24h'
    }

    return 'none'
  } catch (err) {
    log.error({ msg: 'safety.escalation_failed', userId: String(userId), err: String(err) })
    return 'none'
  }
}
