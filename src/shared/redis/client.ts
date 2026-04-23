import { Redis } from '@upstash/redis'

type RedisLike = {
  incr(key: string): Promise<number>
  decr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  get<T>(key: string): Promise<T | null>
  del(key: string): Promise<number>
}

function makeStub(): RedisLike {
  const store = new Map<string, { value: number; expiresAt: number | null }>()

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
    async incr(key) {
      const entry = live(key)
      const next = (entry?.value ?? 0) + 1
      store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null })
      return next
    },
    async decr(key) {
      const entry = live(key)
      const next = (entry?.value ?? 0) - 1
      store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null })
      return next
    },
    async expire(key, seconds) {
      const entry = live(key)
      if (!entry) return 0
      store.set(key, { value: entry.value, expiresAt: Date.now() + seconds * 1000 })
      return 1
    },
    async get<T>(key: string): Promise<T | null> {
      const entry = live(key)
      return entry ? (entry.value as unknown as T) : null
    },
    async del(key) {
      return store.delete(key) ? 1 : 0
    },
  }
}

function createRedis(): RedisLike {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production')
    }
    console.warn('[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing — using in-memory stub (dev only)')
    return makeStub()
  }

  return new Redis({ url, token }) as unknown as RedisLike
}

export const redis = createRedis()
