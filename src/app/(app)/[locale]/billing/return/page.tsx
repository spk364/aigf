'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 15 // 15 * 2s = 30s

type SubscriptionStatus = {
  plan: string
  status: string
} | null

function Spinner() {
  return (
    <div
      className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent-strong)]"
      role="status"
      aria-label="Loading"
    />
  )
}

export default function BillingReturnPage() {
  const t = useTranslations('billing.return')
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') ?? 'success'

  const [attempts, setAttempts] = useState(0)
  const [activated, setActivated] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (status !== 'success') return

    let stopped = false

    async function poll() {
      while (!stopped && attempts < POLL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        if (stopped) break

        try {
          const res = await fetch('/api/billing/status')
          if (res.ok) {
            const data = (await res.json()) as { subscription: SubscriptionStatus }
            if (data.subscription?.status === 'active') {
              setActivated(true)
              stopped = true
              // Redirect to dashboard after short delay
              setTimeout(() => router.push('/dashboard'), 1500)
              return
            }
          }
        } catch {
          // ignore — keep polling
        }

        setAttempts((prev) => {
          const next = prev + 1
          if (next >= POLL_MAX_ATTEMPTS) {
            setTimedOut(true)
            stopped = true
          }
          return next
        })
      }
    }

    void poll()

    return () => {
      stopped = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (status === 'declined') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 text-center">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-danger)]/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-6 w-6 text-[var(--color-danger)]"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-[var(--color-danger)]">{t('declined')}</h1>
          <p className="mb-8 text-sm text-[var(--color-text-muted)]">{t('tryAgain')}</p>
          <Link
            href="../upgrade"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
          >
            {t('tryAgain')}
          </Link>
          <Link
            href="/dashboard"
            className="mt-4 block text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            {t('backToChat')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10">
        {activated ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-success)]/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-6 w-6 text-[var(--color-success)]"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-[var(--color-success)]">{t('success')}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Redirecting to dashboard...</p>
          </>
        ) : timedOut ? (
          <>
            <h1 className="mb-3 text-xl font-semibold text-[var(--color-text)]">
              {t('processing')}
            </h1>
            <p className="mb-6 text-sm text-[var(--color-text-muted)]">
              Your payment was received. Subscription may take a moment to activate.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              {t('backToChat')}
            </Link>
          </>
        ) : (
          <>
            <div className="mb-6 flex justify-center">
              <Spinner />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">
              {t('processing')}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Checking activation status... ({attempts}/{POLL_MAX_ATTEMPTS})
            </p>
          </>
        )}
      </div>
    </main>
  )
}
