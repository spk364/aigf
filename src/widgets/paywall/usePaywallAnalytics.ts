'use client'

import { useCallback } from 'react'
import { posthog } from '@/shared/analytics/posthog-client'

/**
 * Thin wrapper so paywall components don't each branch on the (rare)
 * "PostHog never initialised" case. `posthog.capture` is a no-op when the
 * SDK hasn't been init'd by `initPostHogClient`, so swallowing here keeps
 * call-sites readable.
 */
export function usePaywallAnalytics() {
  return useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      try {
        posthog.capture(event, properties)
      } catch {
        // analytics is best-effort
      }
    },
    [],
  )
}
