export async function register() {
  const dsn = process.env.SENTRY_DSN
  const isProd = process.env.NODE_ENV === 'production'
  const tracesSampleRate = isProd ? 0.1 : 1.0

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!dsn) {
      console.warn('[sentry] SENTRY_DSN not set — server Sentry disabled')
      return
    }
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      tracesSampleRate,
      integrations: [Sentry.httpIntegration(), Sentry.nativeNodeFetchIntegration()],
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    if (!dsn) return
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn,
      tracesSampleRate,
    })
  }
}
