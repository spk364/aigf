// Server-side PostHog singleton

type CaptureArgs = {
  userId: string
  event: string
  properties?: Record<string, unknown>
}

interface PostHogLike {
  capture(args: { distinctId: string; event: string; properties?: Record<string, unknown> }): void
  identify(args: { distinctId: string; properties?: Record<string, unknown> }): void
  shutdown(): Promise<void>
}

// Stub used when POSTHOG_KEY is not configured
const stub: PostHogLike = {
  capture() {},
  identify() {},
  async shutdown() {},
}

function createPostHogClient(): PostHogLike {
  const key = process.env.POSTHOG_KEY
  if (!key) return stub

  // Dynamic import so posthog-node is tree-shaken from the edge runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-node') as typeof import('posthog-node')
  return new PostHog(key, {
    host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
    flushAt: 20,
    flushInterval: 10000,
  })
}

// Singleton — shared across requests within a server lifetime
const posthog: PostHogLike = createPostHogClient()

export { posthog }

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

export function track({ userId, event, properties }: CaptureArgs): void {
  posthog.capture({ distinctId: userId, event, properties })
}
