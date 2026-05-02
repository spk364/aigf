import Link from 'next/link'

type Props = {
  locale: string
  used: number
  cap: number | null
  isPremium: boolean
}

export function QuotaPill({ locale, used, cap, isPremium }: Props) {
  if (cap === null) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent-strong)]/40 bg-[var(--color-accent-strong)]/10 px-3 py-1.5 text-xs">
        <span className="font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          {isPremium ? 'Premium' : 'Unlimited'}
        </span>
        <span className="text-[var(--color-text-muted)]">·</span>
        <span className="text-[var(--color-text-muted)]">{used} today</span>
      </div>
    )
  }
  const pct = Math.min(100, Math.round((used / cap) * 100))
  const nearLimit = pct >= 70
  return (
    <Link
      href={`/${locale}/upgrade`}
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)]"
    >
      <span className="font-semibold">
        {used}
        <span className="text-[var(--color-text-muted)]"> / {cap}</span>
      </span>
      <span className="text-[var(--color-text-muted)]">today</span>
      <span aria-hidden className="text-[var(--color-text-muted)]">·</span>
      <span
        className={
          nearLimit
            ? 'font-semibold text-[var(--color-accent-strong)]'
            : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]'
        }
      >
        Upgrade
      </span>
    </Link>
  )
}
