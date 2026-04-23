'use client'

import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

// global-error must include its own <html> and <body> tags
export default function GlobalErrorPage({ error, reset }: Props) {
  useEffect(() => {
    // Sentry is a no-op when not initialized — safe to call unconditionally
    import('@sentry/nextjs')
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {})
  }, [error])

  return (
    <html>
      <body
        style={{
          backgroundColor: '#0b0a10',
          color: '#f5f2ff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          padding: '1rem',
          textAlign: 'center',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(255, 122, 138, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="#ff7a8a"
            style={{ width: '28px', height: '28px' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#a39cc2' }}>
            An unexpected error occurred. You can try again or go back to the dashboard.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              background: '#1e1b2e',
              border: '1px solid #2b2740',
              borderRadius: '0.75rem',
              color: '#a39cc2',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0.625rem 1.25rem',
            }}
          >
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/dashboard"
            style={{
              background: '#c074ff',
              borderRadius: '0.75rem',
              color: '#0b0a10',
              fontSize: '0.875rem',
              fontWeight: 700,
              padding: '0.625rem 1.25rem',
              textDecoration: 'none',
            }}
          >
            Go to dashboard
          </a>
        </div>
      </body>
    </html>
  )
}
