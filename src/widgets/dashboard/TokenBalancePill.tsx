'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Live token-balance pill for the sidebar. Self-fetches /api/tokens/balance so
// it reflects spends from other routes (image, TTS, character creation) on the
// next render without threading a balance prop through every layout. Links to
// the unified /plans page to top up.
export function TokenBalancePill({ locale, label }: { locale: string; label: string }) {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/tokens/balance', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.balance === 'number') setBalance(d.balance)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Link
      href={`/${locale}/plans`}
      title={label}
      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)]"
    >
      <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4 text-[var(--color-accent)]">
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
        {label}
      </span>
      <span className="font-bold text-[var(--color-text)]">
        {balance === null ? '·' : balance.toLocaleString()}
      </span>
    </Link>
  )
}
