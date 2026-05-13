import 'server-only'
import { headers as getHeaders } from 'next/headers'
import { redis } from '@/shared/redis/client'

const HOUR_LIMIT = 3
const DAY_LIMIT = 20

// Global guest-preview ceiling across all IPs. Per-IP caps above don't help
// against a VPN/proxy rotator; this is a hard $-budget. At ~$0.04 per call
// (fast-sdxl × 2 images), 200/day ≈ $8/day worst case before the system
// stops generating for ANY guest. Authenticated users have their own caps
// upstream and aren't affected.
const GLOBAL_DAY_LIMIT = 200

const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * 60 * 60

export type GuestRateLimitResult =
  | { ok: true }
  | { ok: false; reason: 'hour' | 'day' | 'global'; retryAfterSeconds: number }

async function readClientIp(): Promise<string> {
  const headersList = await getHeaders()
  const fwd = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (fwd) return fwd
  return headersList.get('x-real-ip') ?? 'unknown'
}

export async function checkGuestPreviewRateLimit(): Promise<GuestRateLimitResult> {
  if (process.env.NODE_ENV !== 'production') return { ok: true }

  const ip = await readClientIp()
  const now = new Date()
  const dayKey = `guest:preview:day:${ip}:${now.toISOString().slice(0, 10)}`
  const hourKey = `guest:preview:hour:${ip}:${now.toISOString().slice(0, 13)}`
  const globalKey = `guest:preview:global:${now.toISOString().slice(0, 10)}`

  // Check global first so a single IP burning hour-quota doesn't have to
  // be hit before the global limit kicks in for other IPs. Refund on any
  // downstream reject.
  const globalCount = await redis.incr(globalKey)
  await redis.expire(globalKey, DAY_SECONDS)
  if (globalCount > GLOBAL_DAY_LIMIT) {
    await redis.decr(globalKey)
    return { ok: false, reason: 'global', retryAfterSeconds: DAY_SECONDS }
  }

  const hourCount = await redis.incr(hourKey)
  await redis.expire(hourKey, HOUR_SECONDS)
  if (hourCount > HOUR_LIMIT) {
    await redis.decr(hourKey)
    await redis.decr(globalKey)
    return { ok: false, reason: 'hour', retryAfterSeconds: HOUR_SECONDS }
  }

  const dayCount = await redis.incr(dayKey)
  await redis.expire(dayKey, DAY_SECONDS)
  if (dayCount > DAY_LIMIT) {
    await redis.decr(dayKey)
    await redis.decr(hourKey)
    await redis.decr(globalKey)
    return { ok: false, reason: 'day', retryAfterSeconds: DAY_SECONDS }
  }

  return { ok: true }
}
