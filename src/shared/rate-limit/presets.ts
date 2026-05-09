import 'server-only'
import { headers as getHeaders } from 'next/headers'
import type { RateLimitConfig } from './limiter'

/**
 * Reads the best client IP from request headers.
 *
 * Prefers `x-forwarded-for` (first hop, the real client per Vercel's docs)
 * and falls back to `x-real-ip`. Returns 'unknown' when neither is set so
 * the limiter still has a key to rate against — better to over-limit a
 * misconfigured ingress than to silently bypass the limit.
 */
export async function readClientIp(): Promise<string> {
  const h = await getHeaders()
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (fwd) return fwd
  return h.get('x-real-ip') ?? 'unknown'
}

// Concrete numbers below are sized for a freemium adult-companion product:
// - chat caps allow normal heavy users (a few hundred messages/day) but stop
//   scripts firing 10+/sec.
// - image / video caps reflect dollar cost per call; a single user shouldn't
//   be able to burn more than tens of dollars/hour by accident.
// - auth caps assume real humans hit login a few times/day; bots hit it
//   thousands of times/min.
//
// Tune in env if needed; these are the safe defaults for production.

export const CHAT_LIMIT: RateLimitConfig = {
  name: 'chat',
  windows: [
    { windowSeconds: 60, max: 30 },
    { windowSeconds: 60 * 60, max: 400 },
    { windowSeconds: 24 * 60 * 60, max: 2000 },
  ],
}

export const CHAT_REGENERATE_LIMIT: RateLimitConfig = {
  name: 'chat-regen',
  windows: [
    { windowSeconds: 60, max: 10 },
    { windowSeconds: 60 * 60, max: 100 },
  ],
}

export const IMAGE_GEN_LIMIT: RateLimitConfig = {
  name: 'image-gen',
  windows: [
    { windowSeconds: 60, max: 10 },
    { windowSeconds: 60 * 60, max: 60 },
    { windowSeconds: 24 * 60 * 60, max: 300 },
  ],
}

export const VIDEO_GEN_LIMIT: RateLimitConfig = {
  name: 'video-gen',
  windows: [
    { windowSeconds: 60, max: 3 },
    { windowSeconds: 60 * 60, max: 20 },
    { windowSeconds: 24 * 60 * 60, max: 100 },
  ],
}

export const AUTH_LOGIN_LIMIT: RateLimitConfig = {
  name: 'auth-login',
  windows: [
    { windowSeconds: 60, max: 10 },
    { windowSeconds: 60 * 60, max: 60 },
  ],
}

export const AUTH_REGISTER_LIMIT: RateLimitConfig = {
  name: 'auth-register',
  windows: [
    { windowSeconds: 60 * 60, max: 5 },
    { windowSeconds: 24 * 60 * 60, max: 20 },
  ],
}

export const AUTH_PASSWORD_RESET_LIMIT: RateLimitConfig = {
  name: 'auth-pwd-reset',
  windows: [
    { windowSeconds: 60 * 60, max: 5 },
    { windowSeconds: 24 * 60 * 60, max: 15 },
  ],
}
