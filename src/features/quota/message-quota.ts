import type { BasePayload } from 'payload'
import { redis } from '@/shared/redis/client'
import { isPremiumPlan } from '@/features/billing/plans'

type UserLike = { id: string | number }

/**
 * Free-tier daily message ceiling. Set to 30 based on competitor benchmarks
 * (Candy ~5–7 hits the wall too fast; OurDream gives unlimited text and
 * monetises media instead). 30 leaves room for users to fall in love with
 * a companion before the paywall.
 */
const FREE_TIER_DAILY_CAP = 30

export async function getDailyMessageCap(payload: BasePayload, user: UserLike): Promise<number> {
  const result = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [
        { userId: { equals: user.id } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const sub = result.docs[0]
  if (!sub) return FREE_TIER_DAILY_CAP

  if (isPremiumPlan(sub.plan as string | null)) {
    return Infinity
  }

  return FREE_TIER_DAILY_CAP
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function nextMidnightUTC(): Date {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return next
}

function secondsUntilNextMidnightUTC(): number {
  const now = Date.now()
  const midnight = nextMidnightUTC().getTime()
  return Math.floor((midnight - now) / 1000) + 3600 // +1h safety buffer
}

export async function checkAndIncrementQuota(
  userId: string | number,
  cap: number,
): Promise<{ allowed: boolean; used: number; cap: number; resetAt: Date }> {
  const resetAt = nextMidnightUTC()

  if (cap === Infinity) {
    return { allowed: true, used: 0, cap, resetAt }
  }

  const key = `quota:msg:${userId}:${utcDateString(new Date())}`
  const used = await redis.incr(key)
  await redis.expire(key, secondsUntilNextMidnightUTC())

  if (used > cap) {
    // Undo the increment so rejected requests don't count
    await redis.decr(key)
    return { allowed: false, used: cap, cap, resetAt }
  }

  return { allowed: true, used, cap, resetAt }
}

export async function getQuotaStatus(
  userId: string | number,
  cap: number,
): Promise<{ used: number; cap: number; resetAt: Date }> {
  const resetAt = nextMidnightUTC()

  if (cap === Infinity) {
    return { used: 0, cap, resetAt }
  }

  const key = `quota:msg:${userId}:${utcDateString(new Date())}`
  const raw = await redis.get<number>(key)
  const used = raw ?? 0

  return { used, cap, resetAt }
}
