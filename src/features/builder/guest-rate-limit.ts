import 'server-only'
import { headers as getHeaders } from 'next/headers'
import { redis } from '@/shared/redis/client'

const HOUR_LIMIT = 3
const DAY_LIMIT = 20

const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * 60 * 60

export type GuestRateLimitResult =
  | { ok: true }
  | { ok: false; reason: 'hour' | 'day'; retryAfterSeconds: number }

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

  const hourCount = await redis.incr(hourKey)
  await redis.expire(hourKey, HOUR_SECONDS)
  if (hourCount > HOUR_LIMIT) {
    await redis.decr(hourKey)
    return { ok: false, reason: 'hour', retryAfterSeconds: HOUR_SECONDS }
  }

  const dayCount = await redis.incr(dayKey)
  await redis.expire(dayKey, DAY_SECONDS)
  if (dayCount > DAY_LIMIT) {
    await redis.decr(dayKey)
    await redis.decr(hourKey)
    return { ok: false, reason: 'day', retryAfterSeconds: DAY_SECONDS }
  }

  return { ok: true }
}
