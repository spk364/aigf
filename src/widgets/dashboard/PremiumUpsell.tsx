import Link from 'next/link'

type Props = {
  locale: string
}

const PERKS = [
  'Unlimited daily messages',
  'Premium AI model for richer chats',
  'Priority image & video queue',
  'Unlock NSFW image styles',
] as const

export function PremiumUpsell({ locale }: Props) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--color-accent-strong)]/40 bg-gradient-to-br from-[var(--color-accent-strong)]/15 via-[var(--color-surface)] to-[var(--color-surface)] p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-72 w-72 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, hsl(290 85% 65% / 0.55), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, hsl(330 80% 60% / 0.5), transparent 70%)',
        }}
      />
      <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-bg)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
              <path d="M3 6l3 3 4-6 4 6 3-3-2 10H5L3 6z" />
            </svg>
            Premium
          </span>
          <h2 className="mt-3 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
            Go further with Premium
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            From $12.99/mo. Cancel anytime.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {PERKS.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-2 text-sm text-[var(--color-text)]"
              >
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--color-accent-strong)]/20 text-[var(--color-accent)]">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href={`/${locale}/upgrade`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 text-sm font-bold text-[var(--color-bg)] shadow-[0_18px_40px_-12px_rgba(192,116,255,0.6)] transition-colors hover:bg-[var(--color-accent)]"
          >
            Upgrade now
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <Link
            href={`/${locale}/tokens`}
            className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline sm:text-right"
          >
            Or buy tokens à la carte
          </Link>
        </div>
      </div>
    </section>
  )
}
