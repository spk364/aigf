import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import Link from 'next/link'
import { SiteHeader } from '@/widgets/site-header'
import { ContinueCard } from '@/widgets/dashboard/ContinueCard'
import { MyCompanions } from '@/widgets/dashboard/MyCompanions'
import { RecentConversations } from '@/widgets/dashboard/RecentConversations'
import { DraftsStrip } from '@/widgets/dashboard/DraftsStrip'
import { getDashboardData } from '@/features/dashboard/queries'

type Props = {
  params: Promise<{ locale: string }>
}

// User-centric dashboard: shows the user's own ongoing chat, drafts, custom
// companions, and recent conversations. The candy.ai-style sidebar shell
// (DashboardShell + GenreTabs + HeroBanner + CharactersGrid) lives on the
// landing/explore surfaces — it duplicates discover content the user has
// already seen on /. Dashboard is the "your stuff" page.
export default async function DashboardPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('auth')

  const displayName =
    (user as unknown as { displayName?: string }).displayName || user.email
  const emailVerified = !!(user as unknown as { _verified?: boolean })._verified

  const dashboard = await getDashboardData({
    userId: user.id,
    locale: locale as 'en' | 'ru' | 'es',
  })

  const hasCompanions = dashboard.companions.length > 0
  const hasAnything =
    !!dashboard.hero ||
    dashboard.drafts.length > 0 ||
    hasCompanions ||
    dashboard.recentConversations.length > 0

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="min-h-screen bg-[var(--color-bg)] px-4 pt-24 pb-12 text-[var(--color-text)] sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          {!emailVerified && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
              {t('dashboard.emailNotVerified')}
            </div>
          )}

          <header>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Hello
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {displayName}
            </h1>
          </header>

          {dashboard.drafts.length > 0 && (
            <DraftsStrip locale={locale} drafts={dashboard.drafts} />
          )}

          {dashboard.hero && <ContinueCard locale={locale} hero={dashboard.hero} />}

          {hasCompanions ? (
            <MyCompanions locale={locale} companions={dashboard.companions} />
          ) : (
            <EmptyCompanions locale={locale} />
          )}

          <RecentConversations locale={locale} rows={dashboard.recentConversations} />

          {!hasAnything && (
            <div className="text-center text-sm text-[var(--color-text-muted)]">
              <Link
                href={`/${locale}/explore`}
                className="underline hover:text-[var(--color-text)]"
              >
                Browse the catalog
              </Link>{' '}
              to start your first chat.
            </div>
          )}
        </div>
      </main>
    </>
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
        href={`/${locale}/builder`}
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
      >
        Create my companion
      </Link>
    </section>
  )
}
