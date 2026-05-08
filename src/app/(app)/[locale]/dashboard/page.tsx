import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDailyMessageCap, getQuotaStatus } from '@/features/quota/message-quota'
import { isPremiumPlan } from '@/features/billing/plans'
import { getDashboardData } from '@/features/dashboard/queries'
import { getBalance } from '@/features/tokens/ledger'
import { getFeaturedCharacters } from '@/widgets/landing/featured-data'
import { ContinueCard } from '@/widgets/dashboard/ContinueCard'
import { MyCompanions } from '@/widgets/dashboard/MyCompanions'
import { RecentConversations } from '@/widgets/dashboard/RecentConversations'
import { DraftsStrip } from '@/widgets/dashboard/DraftsStrip'
import { DashboardShell } from '@/widgets/dashboard/DashboardShell'
import { StatsCards } from '@/widgets/dashboard/StatsCards'
import { QuickActions } from '@/widgets/dashboard/QuickActions'
import { DiscoverStrip } from '@/widgets/dashboard/DiscoverStrip'
import { PremiumUpsell } from '@/widgets/dashboard/PremiumUpsell'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('auth')

  const displayName =
    (user as unknown as { displayName?: string }).displayName || user.email

  const emailVerified = !!(user as unknown as { _verified?: boolean })._verified

  const payload = await getPayload({ config })

  // Sequential to avoid blowing the Supabase session-mode pool (size 15).
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [
        { userId: { equals: user.id } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  const cap = await getDailyMessageCap(payload, user)
  const quota = await getQuotaStatus(user.id, cap)
  const dashboard = await getDashboardData({
    userId: user.id,
    locale: locale as 'en' | 'ru' | 'es',
  })
  const tokenBalance = await getBalance(payload, user.id)
  // Reuses the React.cache() wrapper so this query is shared with the landing page.
  const featuredAll = await getFeaturedCharacters()
  const ownedCharacterIds = new Set(
    dashboard.recentConversations
      .map((r) => r.characterId)
      .filter((id): id is string => !!id),
  )
  const featured = featuredAll
    .filter((c) => !ownedCharacterIds.has(c.id))
    .slice(0, 8)

  const sub = subResult.docs[0]
  const isPremium = !!sub && isPremiumPlan(sub.plan as string | null)

  const quotaCap = quota.cap === Infinity ? null : quota.cap

  const hasCompanions = dashboard.companions.length > 0
  const topConversationId = dashboard.hero?.conversationId ?? null

  return (
    <DashboardShell
      locale={locale}
      displayName={displayName}
      email={user.email}
      isPremium={isPremium}
      active="home"
    >
      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          {!emailVerified && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
              {t('dashboard.emailNotVerified')}
            </div>
          )}

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Welcome back
              </p>
              <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
                {displayName}
              </h1>
            </div>
          </header>

          <StatsCards
            locale={locale}
            tokens={tokenBalance}
            quotaUsed={quota.used}
            quotaCap={quotaCap}
            isPremium={isPremium}
            companionsCount={dashboard.companions.length}
          />

          {dashboard.drafts.length > 0 && (
            <DraftsStrip locale={locale} drafts={dashboard.drafts} />
          )}

          <QuickActions
            locale={locale}
            hasCompanions={hasCompanions}
            topConversationId={topConversationId}
          />

          {dashboard.hero && <ContinueCard locale={locale} hero={dashboard.hero} />}

          {hasCompanions ? (
            <MyCompanions locale={locale} companions={dashboard.companions} />
          ) : (
            <EmptyCompanions locale={locale} />
          )}

          {!isPremium && <PremiumUpsell locale={locale} />}

          <DiscoverStrip locale={locale} characters={featured} />

          <RecentConversations locale={locale} rows={dashboard.recentConversations} />
        </div>
      </div>
    </DashboardShell>
  )
}

function EmptyCompanions({ locale }: { locale: string }) {
  return (
    <section className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 p-10 text-center">
      <h2 className="text-2xl font-bold text-[var(--color-text)]">
        Design your first companion
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
        Pick a look, give her a name, and start chatting in under a minute.
      </p>
      <Link
        href={`/${locale}/start`}
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
      >
        Create my companion
      </Link>
    </section>
  )
}
