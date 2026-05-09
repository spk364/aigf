import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted in-memory Redis stub. We bypass the real client.ts factory so
// tests don't depend on UPSTASH env and behave deterministically.
const store = new Map<string, { value: number; expiresAt: number | null }>()

vi.mock('@/shared/redis/client', () => {
  const live = (key: string) => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      store.delete(key)
      return null
    }
    return entry
  }
  return {
    redis: {
      async incr(key: string) {
        const entry = live(key)
        const next = (entry?.value ?? 0) + 1
        store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null })
        return next
      },
      async decr(key: string) {
        const entry = live(key)
        const next = (entry?.value ?? 0) - 1
        store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null })
        return next
      },
      async expire(key: string, seconds: number) {
        const entry = live(key)
        if (!entry) return 0
        store.set(key, { value: entry.value, expiresAt: Date.now() + seconds * 1000 })
        return 1
      },
      async get(key: string) {
        const entry = live(key)
        return entry ? entry.value : null
      },
      async del(key: string) {
        return store.delete(key) ? 1 : 0
      },
    },
  }
})

import { checkRateLimit, type RateLimitConfig } from './limiter'

beforeEach(() => {
  store.clear()
  vi.useRealTimers()
})

const cfg = (max: number, windowSeconds = 60): RateLimitConfig => ({
  name: 'test',
  windows: [{ windowSeconds, max }],
})

describe('checkRateLimit', () => {
  it('allows requests under the limit', async () => {
    const c = cfg(3)
    const a = await checkRateLimit(c, 'user-1')
    const b = await checkRateLimit(c, 'user-1')
    const d = await checkRateLimit(c, 'user-1')
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
    expect(d.allowed).toBe(true)
    expect(d.remaining).toBe(0)
  })

  it('blocks once the limit is reached', async () => {
    const c = cfg(2)
    await checkRateLimit(c, 'user-1')
    await checkRateLimit(c, 'user-1')
    const blocked = await checkRateLimit(c, 'user-1')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.blockedBy).toBe(60)
  })

  it('keeps separate counters per identifier', async () => {
    const c = cfg(1)
    const a = await checkRateLimit(c, 'user-A')
    const b = await checkRateLimit(c, 'user-B')
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
    const blockedA = await checkRateLimit(c, 'user-A')
    expect(blockedA.allowed).toBe(false)
  })

  it('keeps separate counters per limit name', async () => {
    const c1: RateLimitConfig = { name: 'foo', windows: [{ windowSeconds: 60, max: 1 }] }
    const c2: RateLimitConfig = { name: 'bar', windows: [{ windowSeconds: 60, max: 1 }] }
    const a = await checkRateLimit(c1, 'user')
    const b = await checkRateLimit(c2, 'user')
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
  })

  it('rolls over when the time bucket changes', async () => {
    const c = cfg(1, 60)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T12:00:30Z'))
    const a = await checkRateLimit(c, 'user-1')
    expect(a.allowed).toBe(true)
    const blocked = await checkRateLimit(c, 'user-1')
    expect(blocked.allowed).toBe(false)
    // Cross the next minute boundary — bucket changes, fresh allowance.
    vi.setSystemTime(new Date('2026-05-09T12:01:30Z'))
    const allowedAgain = await checkRateLimit(c, 'user-1')
    expect(allowedAgain.allowed).toBe(true)
  })

  it('enforces the most restrictive of multiple windows', async () => {
    const c: RateLimitConfig = {
      name: 'multi',
      windows: [
        { windowSeconds: 60, max: 100 },
        { windowSeconds: 3600, max: 2 },
      ],
    }
    await checkRateLimit(c, 'user-1')
    await checkRateLimit(c, 'user-1')
    const blocked = await checkRateLimit(c, 'user-1')
    expect(blocked.allowed).toBe(false)
    // Hour window is the one that should bite first.
    expect(blocked.blockedBy).toBe(3600)
  })

  it('reports remaining = 0 once max is exhausted but still under limit', async () => {
    const c = cfg(2)
    const a = await checkRateLimit(c, 'user-1')
    expect(a.remaining).toBe(1)
    const b = await checkRateLimit(c, 'user-1')
    expect(b.remaining).toBe(0)
    expect(b.allowed).toBe(true)
  })

  it('treats empty identifier as always-allowed (escape hatch)', async () => {
    const c = cfg(1)
    const a = await checkRateLimit(c, '')
    const b = await checkRateLimit(c, '')
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
  })
})
