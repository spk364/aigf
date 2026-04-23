'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: Props) {
  const t = useTranslations('errors')

  useEffect(() => {
    // Sentry is a no-op when not initialized — safe to call unconditionally
    import('@sentry/nextjs')
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {})
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-bg)] px-4 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-danger)]/10"
        aria-hidden
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-7 w-7 text-[var(--color-danger)]"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
      </div>

      <div>
        <h1 className="mb-2 text-2xl font-bold text-[var(--color-text)]">
          {t('somethingWentWrong')}
        </h1>
        {error.digest && (
          <p className="text-xs text-[var(--color-text-muted)]">Error ID: {error.digest}</p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border)]"
        >
          {t('tryAgain')}
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl bg-[var(--color-accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
        >
          {t('goToDashboard')}
        </Link>
      </div>
    </main>
  )
}
