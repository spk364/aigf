import * as Sentry from '@sentry/nextjs'
import { browserTracingIntegration, captureRouterTransitionStart } from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [browserTracingIntegration()],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

// Required by @sentry/nextjs to instrument App Router navigations
export const onRouterTransitionStart = captureRouterTransitionStart
