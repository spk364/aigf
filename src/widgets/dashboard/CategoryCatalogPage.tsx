import { getPayload } from 'payload'
import config from '@payload-config'
import { isPremiumPlan } from '@/features/billing/plans'
import { getCurrentUser } from '@/shared/auth/current-user'
import { getCharactersByCategory, type CharacterCategory } from '@/widgets/landing/featured-data'
import { getActiveBannersForPage, type BannerPage } from './banners-data'
import { DashboardShell } from './DashboardShell'
import { GenreTabs } from './GenreTabs'
import { HeroBanner } from './HeroBanner'
import { StoriesRow } from './StoriesRow'
import { LiveAction } from './LiveAction'
import { CharactersGrid } from './CharactersGrid'

type Props = {
  locale: string
  category: CharacterCategory
}

const CATEGORY_TO_PAGE: Record<CharacterCategory, BannerPage> = {
  girls: 'girls',
  anime: 'anime',
  boys: 'boys',
}

const CATEGORY_TO_TAB: Record<CharacterCategory, 'girls' | 'anime' | 'guys'> = {
  girls: 'girls',
  anime: 'anime',
  boys: 'guys',
}

export async function CategoryCatalogPage({ locale, category }: Props) {
  const user = await getCurrentUser()

  let displayName: string | null = null
  let email: string | null = null
  let isPremium = false

  if (user) {
    displayName = (user as unknown as { displayName?: string }).displayName ?? null
    email = user.email ?? null
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
    isPremium = !!sub && isPremiumPlan(sub.plan as string | null)
  }

  const [characters, banners] = await Promise.all([
    getCharactersByCategory(category, locale),
    getActiveBannersForPage(CATEGORY_TO_PAGE[category], locale),
  ])

  const stories = characters.slice(0, 12)
  const live = characters.slice(0, 8)
  const heroCover = characters[0]?.photoUrl ?? null

  return (
    <DashboardShell
      locale={locale}
      displayName={displayName}
      email={email}
      isPremium={isPremium}
      active="home"
    >
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-10">
          <GenreTabs locale={locale} active={CATEGORY_TO_TAB[category]} />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="animate-fade-in-up">
            <HeroBanner locale={locale} banners={banners} coverImageUrl={heroCover} />
          </div>

          {stories.length > 0 && (
            <div className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
              <StoriesRow locale={locale} characters={stories} />
            </div>
          )}
          {live.length > 0 && (
            <div className="animate-fade-in-up" style={{ animationDelay: '140ms' }}>
              <LiveAction locale={locale} characters={live} />
            </div>
          )}
          <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <CharactersGrid locale={locale} characters={characters} />
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
