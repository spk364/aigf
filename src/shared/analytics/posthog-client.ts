'use client'

import posthog from 'posthog-js'

let initialized = false

export function initPostHogClient(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || initialized) return
  initialized = true

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    autocapture: false, // no DOM event capture — PII in inputs
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  })
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.identify(userId, traits)
}

export { posthog }
