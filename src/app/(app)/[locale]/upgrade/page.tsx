import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { buildCheckoutUrl } from '@/features/billing/ccbill/checkout'
import { PLANS } from '@/features/billing/plans'
import type { PlanKey } from '@/features/billing/plans'
import { track } from '@/shared/analytics/posthog'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function UpgradePage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('billing')

  const payload = await getPayload({ config })

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: user.id }, status: { equals: 'active' } },
    limit: 1,
    overrideAccess: true,
  })

  const activeSub = subResult.docs[0] ?? null
  const isBillingConfigured = !!process.env.CCBILL_ACCOUNT_NUM

  track({
    userId: String(user.id),
    event: 'paywall.shown',
    properties: { hasSubscription: !!activeSub },
  })

  async function checkoutAction(plan: PlanKey) {
    'use server'
    const checkoutUrl = buildCheckoutUrl({ userId: user.id, plan, locale })
    redirect(checkoutUrl)
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`
  }

  const planOrder: PlanKey[] = ['premium_monthly', 'premium_yearly', 'premium_plus_monthly']

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            Plans
          </p>
          <h1 className="mb-3 text-4xl font-bold text-[var(--color-text)]">
            {t('upgrade.title')}
          </h1>
          <p className="text-[var(--color-text-muted)]">{t('upgrade.subtitle')}</p>
        </div>

        {!isBillingConfigured && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
            Billing is not configured. Set{' '}
            <code className="font-mono text-amber-200">CCBILL_ACCOUNT_NUM</code> and related env
            vars to enable checkout.
          </div>
        )}

        {activeSub && (
          <div className="mb-8 rounded-xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-soft)] px-5 py-4">
            <p className="text-sm text-[var(--color-accent)]">
              {t('upgrade.currentPlan')}{' '}
              <span className="font-semibold capitalize text-[var(--color-text)]">
                {String(activeSub.plan).replace(/_/g, ' ')}
              </span>
            </p>
            <a
              href={`/${locale}/billing/manage`}
              className="mt-2 inline-block text-sm text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              {t('upgrade.manage')}
            </a>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {planOrder.map((planKey, idx) => {
            const plan = PLANS[planKey]
            const isYearly = plan.billingPeriod === 'yearly'
            const isEmphasized = idx === 0 // Premium Monthly — center visually emphasized

            return (
              <div
                key={planKey}
                className={[
                  'relative flex flex-col rounded-2xl border p-6 shadow-lg transition-shadow',
                  isEmphasized
                    ? 'border-[var(--color-accent-strong)]/50 bg-[var(--color-accent-soft)] shadow-[var(--color-accent-strong)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {isYearly && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs font-bold text-[var(--color-bg)]">
                    {t('plans.premium_yearly.badge')}
                  </span>
                )}

                {isEmphasized && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs font-bold text-[var(--color-bg)]">
                    Most popular
                  </span>
                )}

                <h2 className="mb-1 text-lg font-bold text-[var(--color-text)]">
                  {t(`plans.${planKey}.name`)}
                </h2>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                  {t(`plans.${planKey}.description`)}
                </p>
                <p className="mb-6 text-3xl font-bold text-[var(--color-text)]">
                  {t(`plans.${planKey}.priceLabel`, { price: formatPrice(plan.priceCents) })}
                </p>

                <ul className="mb-8 flex-1 space-y-2.5 text-sm text-[var(--color-text-muted)]">
                  <li className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('features.monthlyTokens', {
                      count: plan.features.monthlyTokenAllocation,
                    })}
                  </li>
                  <li className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('features.llmTier', {
                      tier: plan.features.llmTier.replace(/_/g, ' '),
                    })}
                  </li>
                  <li className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('features.customCharacters')}
                  </li>
                  {plan.features.priorityQueue && (
                    <li className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                        aria-hidden
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t('features.priorityQueue')}
                    </li>
                  )}
                  {plan.features.videoEnabled && (
                    <li className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 shrink-0 text-[var(--color-success)]"
                        aria-hidden
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t('features.videoEnabled', {
                        count: plan.features.monthlyVideoQuota,
                      })}
                    </li>
                  )}
                </ul>

                <form
                  action={async () => {
                    'use server'
                    await checkoutAction(planKey)
                  }}
                >
                  <button
                    type="submit"
                    className={[
                      'w-full rounded-xl py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2',
                      isEmphasized
                        ? 'bg-[var(--color-accent-strong)] text-[var(--color-bg)] hover:bg-[var(--color-accent)] focus-visible:ring-offset-[var(--color-accent-soft)]'
                        : 'border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface)] focus-visible:ring-offset-[var(--color-surface)]',
                    ].join(' ')}
                  >
                    {t('upgrade.cta')}
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
