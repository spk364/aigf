import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isPremiumPlan } from '@/features/billing/plans'
import { getFeaturedCharacters } from '@/widgets/landing/featured-data'
import { DashboardShell } from '@/widgets/dashboard/DashboardShell'
import { GenreTabs } from '@/widgets/dashboard/GenreTabs'
import { HeroBanner } from '@/widgets/dashboard/HeroBanner'
import { StoriesRow } from '@/widgets/dashboard/StoriesRow'
import { LiveAction } from '@/widgets/dashboard/LiveAction'
import { CharactersGrid } from '@/widgets/dashboard/CharactersGrid'

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
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [{ userId: { equals: user.id } }, { status: { equals: 'active' } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  const sub = subResult.docs[0]
  const isPremium = !!sub && isPremiumPlan(sub.plan as string | null)

  const featured = await getFeaturedCharacters()
  const stories = featured.slice(0, 12)
  const live = featured.slice(0, 8)
  const heroCover = featured[0]?.photoUrl ?? null

  return (
    <DashboardShell
      locale={locale}
      displayName={displayName}
      email={user.email}
      isPremium={isPremium}
      active="home"
    >
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-10">
          <GenreTabs locale={locale} active="girls" />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          {!emailVerified && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
              {t('dashboard.emailNotVerified')}
            </div>
          )}

          <HeroBanner locale={locale} coverImageUrl={heroCover} />

          <StoriesRow locale={locale} characters={stories} />

          <LiveAction locale={locale} characters={live} />

          <CharactersGrid locale={locale} characters={featured} />
        </div>
      </div>
    </DashboardShell>
  )
}
