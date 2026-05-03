import { getPayload } from 'payload'
import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getBalance } from '@/features/tokens/ledger'
import { purchaseTokenPackAction } from '@/features/billing/token-packs/actions'
import { isTokenPackBillingMocked } from '@/features/billing/token-packs/checkout'

type Props = {
  params: Promise<{ locale: string }>
}

type PackLocaleField = string | Record<string, string> | null | undefined

function pickLocaleString(field: PackLocaleField, locale: string, fallback: string): string {
  if (!field) return fallback
  if (typeof field === 'string') return field
  return field[locale] ?? field['en'] ?? fallback
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default async function TokensPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('billing.tokens')

  const payload = await getPayload({ config })

  const [packsResult, balance] = await Promise.all([
    payload.find({
      collection: 'token-packages',
      where: { isActive: { equals: true } },
      sort: 'displayOrder',
      limit: 20,
      overrideAccess: true,
    }),
    getBalance(payload, user.id),
  ])

  const packs = packsResult.docs
  const isMocked = isTokenPackBillingMocked()

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {t('eyebrow')}
          </p>
          <h1 className="mb-3 text-4xl font-bold text-[var(--color-text)]">{t('title')}</h1>
          <p className="text-[var(--color-text-muted)]">{t('subtitle')}</p>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm">
            <span className="text-[var(--color-text-muted)]">{t('currentBalance')}</span>
            <span className="font-bold text-[var(--color-text)]">{balance}</span>
          </div>
        </div>

        {isMocked && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-300">
            {t('mockMode')}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {packs.map((pack) => {
            const sku = pack.sku as string
            const tokenAmount = pack.tokenAmount as number
            const priceCents = pack.priceCents as number
            const displayName = pickLocaleString(
              pack.displayName as PackLocaleField,
              locale,
              `${tokenAmount} tokens`,
            )
            const badge = pickLocaleString(pack.badgeText as PackLocaleField, locale, '')
            const pricePerToken = priceCents / 100 / tokenAmount

            return (
              <div
                key={String(pack.id)}
                className={[
                  'relative flex flex-col rounded-2xl border p-6 shadow-lg transition-shadow',
                  badge
                    ? 'border-[var(--color-accent-strong)]/50 bg-[var(--color-accent-soft)] shadow-[var(--color-accent-strong)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]',
                ].join(' ')}
              >
                {badge && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs font-bold text-[var(--color-bg)]">
                    {badge}
                  </span>
                )}

                <h2 className="mb-1 text-lg font-bold text-[var(--color-text)]">{displayName}</h2>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                  {t('perToken', { price: `$${pricePerToken.toFixed(3)}` })}
                </p>
                <p className="mb-6 text-3xl font-bold text-[var(--color-text)]">
                  {formatPrice(priceCents)}
                </p>

                <form
                  action={async () => {
                    'use server'
                    await purchaseTokenPackAction(sku)
                  }}
                  className="mt-auto"
                >
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[var(--color-accent-strong)] py-3 text-sm font-bold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
                  >
                    {t('buy')}
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
