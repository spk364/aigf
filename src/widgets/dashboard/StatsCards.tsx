import Link from 'next/link'

type Props = {
  locale: string
  tokens: number
  quotaUsed: number
  quotaCap: number | null
  isPremium: boolean
  companionsCount: number
}

function CoinsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 11-3.4-6.5L21 4l-1 4.5A8 8 0 0121 12z" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.35-9.5-9.13C.93 8.45 2.6 4.86 5.84 4.86c1.95 0 3.42 1.1 4.16 2.58.74-1.48 2.21-2.58 4.16-2.58 3.24 0 4.91 3.59 3.34 7.01C19 16.65 12 21 12 21z" />
    </svg>
  )
}

export function StatsCards({
  locale,
  tokens,
  quotaUsed,
  quotaCap,
  isPremium,
  companionsCount,
}: Props) {
  const quotaPct =
    quotaCap === null
      ? 100
      : Math.min(100, Math.round((quotaUsed / Math.max(quotaCap, 1)) * 100))
  const quotaNearLimit = quotaCap !== null && quotaPct >= 70

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* Tokens */}
      <Link
        href={`/${locale}/tokens`}
        className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)]"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(120% 80% at 100% 0%, rgba(192,116,255,0.18), transparent 60%)',
          }}
          aria-hidden
        />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="text-[var(--color-accent)]">
                <CoinsIcon />
              </span>
              Tokens
            </p>
            <p className="text-3xl font-bold text-[var(--color-text)]">
              {tokens.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              For images, video & voice
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent-strong)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent-strong)] group-hover:text-[var(--color-bg)]">
            Top up
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </Link>

      {/* Daily messages quota */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="text-[var(--color-accent)]">
                <ChatIcon />
              </span>
              Daily messages
            </p>
            {quotaCap === null ? (
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {quotaUsed}
                <span className="ml-1 text-sm font-medium text-[var(--color-text-muted)]">today</span>
              </p>
            ) : (
              <p className="text-3xl font-bold text-[var(--color-text)]">
                {quotaUsed}
                <span className="ml-1 text-base font-medium text-[var(--color-text-muted)]">
                  / {quotaCap}
                </span>
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {isPremium ? 'Unlimited chat included' : 'Resets at midnight UTC'}
            </p>
          </div>
        </div>
        {quotaCap !== null && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className={
                'h-full rounded-full transition-all ' +
                (quotaNearLimit
                  ? 'bg-[var(--color-accent-strong)]'
                  : 'bg-[var(--color-accent)]')
              }
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Companions count */}
      <Link
        href={`/${locale}/start`}
        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="text-[var(--color-accent)]">
                <HeartIcon />
              </span>
              Companions
            </p>
            <p className="text-3xl font-bold text-[var(--color-text)]">{companionsCount}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {companionsCount === 0
                ? 'Create your first one'
                : companionsCount === 1
                  ? '1 in your roster'
                  : `${companionsCount} in your roster`}
            </p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-accent-strong)]/15 text-[var(--color-accent)] transition-colors group-hover:bg-[var(--color-accent-strong)] group-hover:text-[var(--color-bg)]">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </Link>
    </div>
  )
}
