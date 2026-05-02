import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { logoutAction } from '@/features/auth/actions/logout'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDailyMessageCap, getQuotaStatus } from '@/features/quota/message-quota'
import { getDashboardData } from '@/features/dashboard/queries'
import { ContinueCard } from '@/widgets/dashboard/ContinueCard'
import { MyCompanions } from '@/widgets/dashboard/MyCompanions'
import { RecentConversations } from '@/widgets/dashboard/RecentConversations'
import { DraftsStrip } from '@/widgets/dashboard/DraftsStrip'
import { QuotaPill } from '@/widgets/dashboard/QuotaPill'

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

  const [cap, dashboard, subResult] = await Promise.all([
    getDailyMessageCap(payload, user),
    getDashboardData({
      userId: user.id,
      locale: locale as 'en' | 'ru' | 'es',
    }),
    payload.find({
      collection: 'subscriptions',
      where: {
        and: [
          { userId: { equals: user.id } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    }),
  ])
  const quota = await getQuotaStatus(user.id, cap)

  const sub = subResult.docs[0]
  const isPremium = !!(
    sub &&
    (sub.plan === 'premium_monthly' ||
      sub.plan === 'premium_yearly' ||
      sub.plan === 'premium_plus_monthly')
  )

  const quotaCap = quota.cap === Infinity ? null : quota.cap

  async function handleLogout() {
    'use server'
    await logoutAction()
    redirect(`/${locale}/login`)
  }

  const hasCompanions = dashboard.companions.length > 0

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {!emailVerified && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
            {t('dashboard.emailNotVerified')}
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Hello
            </p>
            <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
              {displayName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <QuotaPill
              locale={locale}
              used={quota.used}
              cap={quotaCap}
              isPremium={isPremium}
            />
            <form action={handleLogout}>
              <button
                type="submit"
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                {t('dashboard.logout')}
              </button>
            </form>
          </div>
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
      </div>
    </main>
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
