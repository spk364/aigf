// Multi-window fixed-bucket rate limiter backed by Upstash Redis.
//
// Why fixed-window, not sliding: our use case is cost protection, not precise
// fairness. Fixed buckets need only INCR + EXPIRE — atomic, two round-trips
// max per check, works against the existing minimal Redis interface without
// requiring sorted sets. Burst at bucket boundaries is acceptable (cost is
// still bounded by the higher-window cap).
//
// Multi-window: pass several windows to enforce both burst (e.g. 60/min) and
// sustained (e.g. 1000/day) limits in one call.

import { redis } from '@/shared/redis/client'

export type RateWindow = {
  /** Window length in seconds. */
  windowSeconds: number
  /** Max requests permitted within the window. */
  max: number
}

export type RateLimitResult = {
  allowed: boolean
  /** Total remaining across all windows (min). 0 when blocked. */
  remaining: number
  /** Seconds until the most-restrictive window opens up. 0 when allowed. */
  retryAfterSeconds: number
  /** Which window blocked the request, if any (windowSeconds value). */
  blockedBy: number | null
}

export type RateLimitConfig = {
  /** Logical name for the limit (e.g. 'chat', 'image-gen'). */
  name: string
  /** One or more windows that ALL must pass for a request to be allowed. */
  windows: RateWindow[]
}

const ALLOW: RateLimitResult = {
  allowed: true,
  remaining: Number.MAX_SAFE_INTEGER,
  retryAfterSeconds: 0,
  blockedBy: null,
}

/**
 * Check + increment all configured windows for `identifier`.
 *
 * Returns `allowed: true` only when EVERY window has capacity.
 * On reject, the longest restrictive `retryAfterSeconds` is returned so the
 * caller can set a single `Retry-After` header.
 *
 * Note: this increments counters even on reject. That is fine for cost
 * protection — rejected work is cheap and we want abuse signals to leak
 * into the longer windows. Over-counting is bounded by the limit itself.
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  identifier: string,
): Promise<RateLimitResult> {
  if (!identifier) return ALLOW

  const now = Math.floor(Date.now() / 1000)
  let worstRetryAfter = 0
  let worstWindow: number | null = null
  let minRemaining = Number.MAX_SAFE_INTEGER

  for (const w of config.windows) {
    const bucket = Math.floor(now / w.windowSeconds)
    const bucketEnd = (bucket + 1) * w.windowSeconds
    const key = `rl:${config.name}:${identifier}:${w.windowSeconds}:${bucket}`

    const count = await redis.incr(key)
    if (count === 1) {
      // First hit in this bucket — set expiry. Use windowSeconds + small
      // grace to survive clock drift between the app and Redis.
      await redis.expire(key, w.windowSeconds + 5)
    }

    const remaining = Math.max(0, w.max - count)
    if (remaining < minRemaining) minRemaining = remaining

    if (count > w.max) {
      const retryAfter = Math.max(1, bucketEnd - now)
      if (retryAfter > worstRetryAfter) {
        worstRetryAfter = retryAfter
        worstWindow = w.windowSeconds
      }
    }
  }

  if (worstWindow !== null) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: worstRetryAfter,
      blockedBy: worstWindow,
    }
  }

  return {
    allowed: true,
    remaining: minRemaining,
    retryAfterSeconds: 0,
    blockedBy: null,
  }
}

/** 429 response body shape for rate-limited requests. */
export function rateLimitResponseBody(result: RateLimitResult, message?: string) {
  return {
    error: 'rate_limited',
    message: message ?? 'Too many requests',
    retryAfterSeconds: result.retryAfterSeconds,
    blockedBy: result.blockedBy,
  }
}

/** Standard Retry-After + RateLimit-* headers for a 429 response. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'Retry-After': String(result.retryAfterSeconds),
    'X-RateLimit-Remaining': String(result.remaining),
  }
}
