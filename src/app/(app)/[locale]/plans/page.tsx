import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getBalance } from '@/features/tokens/ledger'
import { buildCheckoutUrl } from '@/features/billing/ccbill/checkout'
import { PLANS, type PlanKey } from '@/features/billing/plans'
import { purchaseTokenPackAction } from '@/features/billing/token-packs/actions'
import {
  isTokenPackBillingMocked,
  isCryptoTokenPackBillingMocked,
} from '@/features/billing/token-packs/checkout'

type Props = { params: Promise<{ locale: string }> }

type PackLocaleField = string | Record<string, string> | null | undefined
function pickLocaleString(field: PackLocaleField, locale: string, fallback: string): string {
  if (!field) return fallback
  if (typeof field === 'string') return field
  return field[locale] ?? field['en'] ?? fallback
}
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden>
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  )
}

// Unified pricing page: subscriptions + one-time token packs in one place.
// /upgrade and /tokens still exist (linked from paywalls); this is the single
// canonical "see everything you can buy" surface, reachable from the sidebar
// and the token balance pill.
export default async function PlansPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('billing')
  const tTokens = await getTranslations('billing.tokens')
  const payload = await getPayload({ config })

  const [subResult, packsResult, balance] = await Promise.all([
    payload.find({
      collection: 'subscriptions',
      where: { userId: { equals: user.id }, status: { equals: 'active' } },
      limit: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'token-packages',
      where: { isActive: { equals: true } },
      sort: 'displayOrder',
      limit: 20,
      overrideAccess: true,
    }),
    getBalance(payload, user.id),
  ])

  const activeSub = subResult.docs[0] ?? null
  const isBillingConfigured = !!process.env.CCBILL_ACCOUNT_NUM
  const cardMocked = isTokenPackBillingMocked()
  const cryptoMocked = isCryptoTokenPackBillingMocked()
  const allMocked = cardMocked && cryptoMocked
  const showCardButton = !cardMocked || allMocked
  const showCryptoButton = !cryptoMocked || allMocked

  const planOrder: PlanKey[] = [
    'premium_monthly',
    'premium_yearly',
    'premium_plus_monthly',
    'premium_plus_yearly',
  ]
  const emphasizedKey: PlanKey = 'premium_plus_monthly'

  async function checkoutAction(plan: PlanKey) {
    'use server'
    redirect(buildCheckoutUrl({ userId: user.id, plan, locale }))
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {t('upgrade.title')}
          </p>
          <h1 className="font-display mb-3 text-4xl font-bold text-[var(--color-text)]">{t('upgrade.subtitle')}</h1>
          <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm">
            <span className="text-[var(--color-text-muted)]">{tTokens('currentBalance')}</span>
            <span className="font-bold text-[var(--color-text)]">{balance}</span>
          </div>
        </div>

        {!isBillingConfigured && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
            Billing is not configured. Set <code className="font-mono text-amber-200">CCBILL_ACCOUNT_NUM</code> and related env vars to enable checkout.
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
            <a href={`/${locale}/billing/manage`} className="mt-2 inline-block text-sm text-[var(--color-accent)] underline-offset-2 hover:underline">
              {t('upgrade.manage')}
            </a>
          </div>
        )}

        {/* ── Subscriptions ─────────────────────────────────────────────── */}
        <h2 className="mb-5 text-xl font-bold text-[var(--color-text)]">{t('plansSection.subscriptions')}</h2>
        <div className="mb-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {planOrder.map((planKey) => {
            const plan = PLANS[planKey]
            const isYearly = plan.billingPeriod === 'yearly'
            const isEmphasized = planKey === emphasizedKey
            return (
              <div
                key={planKey}
                className={[
                  'relative flex flex-col rounded-2xl border p-6 shadow-lg',
                  isEmphasized
                    ? 'border-[var(--color-accent-strong)]/50 bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {(isEmphasized || isYearly) && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs font-bold text-[var(--color-bg)]">
                    {isEmphasized ? t('upgrade.mostPopular') : t(`plans.${planKey}.badge`)}
                  </span>
                )}
                <h3 className="mb-1 text-lg font-bold text-[var(--color-text)]">{t(`plans.${planKey}.name`)}</h3>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t(`plans.${planKey}.description`)}</p>
                <p className="mb-6 text-3xl font-bold text-[var(--color-text)]">
                  {t(`plans.${planKey}.priceLabel`, { price: formatPrice(plan.priceCents) })}
                </p>
                <ul className="mb-8 flex-1 space-y-2.5 text-sm text-[var(--color-text-muted)]">
                  <li className="flex items-center gap-2"><Check />{t('features.monthlyTokens', { count: plan.features.monthlyTokenAllocation })}</li>
                  <li className="flex items-center gap-2"><Check />{t('features.llmTier', { tier: plan.features.llmTier.replace(/_/g, ' ') })}</li>
                  <li className="flex items-center gap-2"><Check />{t('features.customCharacters')}</li>
                  {plan.features.priorityQueue && <li className="flex items-center gap-2"><Check />{t('features.priorityQueue')}</li>}
                  {plan.features.videoEnabled && <li className="flex items-center gap-2"><Check />{t('features.videoEnabled', { count: plan.features.monthlyVideoQuota })}</li>}
                </ul>
                <form action={async () => { 'use server'; await checkoutAction(planKey) }}>
                  <button
                    type="submit"
                    className={[
                      'w-full rounded-xl py-3 text-sm font-bold transition-colors',
                      isEmphasized
                        ? 'bg-[var(--color-accent-strong)] text-[var(--color-bg)] hover:bg-[var(--color-accent)]'
                        : 'border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface)]',
                    ].join(' ')}
                  >
                    {t('upgrade.cta')}
                  </button>
                </form>
              </div>
            )
          })}
        </div>

        {/* ── Token packs ───────────────────────────────────────────────── */}
        <h2 className="mb-2 text-xl font-bold text-[var(--color-text)]">{t('plansSection.tokenPacks')}</h2>
        <p className="mb-5 text-sm text-[var(--color-text-muted)]">{t('plansSection.tokenPacksHint')}</p>
        {allMocked && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
            {tTokens('mockMode')}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {packsResult.docs.map((pack) => {
            const sku = pack.sku as string
            const tokenAmount = pack.tokenAmount as number
            const priceCents = pack.priceCents as number
            const displayName = pickLocaleString(pack.displayName as PackLocaleField, locale, `${tokenAmount} tokens`)
            const badge = pickLocaleString(pack.badgeText as PackLocaleField, locale, '')
            const pricePerToken = priceCents / 100 / tokenAmount
            return (
              <div
                key={String(pack.id)}
                className={[
                  'relative flex flex-col rounded-2xl border p-6 shadow-lg',
                  badge ? 'border-[var(--color-accent-strong)]/50 bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {badge && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs font-bold text-[var(--color-bg)]">
                    {badge}
                  </span>
                )}
                <h3 className="mb-1 text-lg font-bold text-[var(--color-text)]">{displayName}</h3>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">{tTokens('perToken', { price: `$${pricePerToken.toFixed(3)}` })}</p>
                <p className="mb-6 text-3xl font-bold text-[var(--color-text)]">{formatPrice(priceCents)}</p>
                <div className="mt-auto flex flex-col gap-2">
                  {showCardButton && (
                    <form action={async () => { 'use server'; await purchaseTokenPackAction(sku, 'card') }}>
                      <button type="submit" className="w-full rounded-xl bg-[var(--color-accent-strong)] py-3 text-sm font-bold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]">
                        {tTokens('payCard')}
                      </button>
                    </form>
                  )}
                  {showCryptoButton && (
                    <form action={async () => { 'use server'; await purchaseTokenPackAction(sku, 'crypto') }}>
                      <button
                        type="submit"
                        className={[
                          'w-full rounded-xl py-3 text-sm font-bold transition-colors',
                          showCardButton
                            ? 'border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                            : 'bg-[var(--color-accent-strong)] text-[var(--color-bg)] hover:bg-[var(--color-accent)]',
                        ].join(' ')}
                      >
                        {tTokens('payCrypto')}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
