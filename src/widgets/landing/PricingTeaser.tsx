import Link from 'next/link'

type Plan = {
  name: string
  price: string
  cadence: string
  blurb: string
  features: string[]
  cta: { label: string; href: (locale: string) => string }
  highlight?: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Try the full experience with daily limits.',
    features: [
      '50 messages per day',
      'Access to all 12 companions',
      'Custom character builder',
      'Text-only conversations',
    ],
    cta: { label: 'Start free', href: (l) => `/${l}/signup` },
  },
  {
    name: 'Premium',
    price: '$14.99',
    cadence: '/month',
    blurb: 'Unlimited chats, photos, and memory.',
    features: [
      'Unlimited messages',
      '50 AI photos per month',
      'Voice messages',
      'Long-term memory',
      'Priority response time',
    ],
    cta: { label: 'Go Premium', href: (l) => `/${l}/upgrade` },
    highlight: true,
  },
]

type Props = {
  locale: string
}

export function PricingTeaser({ locale }: Props) {
  return (
    <section className="relative w-full bg-[var(--color-bg)] py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            Pricing
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            Simple plans, no surprises
          </h2>
          <p className="mt-2 text-[var(--color-text-muted)]">
            Start free. Upgrade when you want photos, voice, and unlimited chat.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.highlight
                  ? 'relative overflow-hidden rounded-2xl border-2 border-[var(--color-accent-strong)] bg-[var(--color-surface)] p-8 shadow-[0_24px_60px_-20px_rgba(192,116,255,0.45)]'
                  : 'relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8'
              }
            >
              {plan.highlight && (
                <span className="absolute right-6 top-6 rounded-full bg-[var(--color-accent-strong)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-bg)]">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-[var(--color-text)]">{plan.name}</h3>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{plan.blurb}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight text-[var(--color-text)]">
                  {plan.price}
                </span>
                <span className="text-sm text-[var(--color-text-muted)]">{plan.cadence}</span>
              </p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-[var(--color-text)]/90"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06L8.674 12.26l6.97-6.97a.75.75 0 011.06 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.cta.href(locale)}
                className={
                  plan.highlight
                    ? 'mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]'
                    : 'mt-8 inline-flex w-full items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-6 py-3 font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]/70'
                }
              >
                {plan.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
