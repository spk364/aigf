import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { logoutAction } from '@/features/auth/actions/logout'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDailyMessageCap, getQuotaStatus } from '@/features/quota/message-quota'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('auth')
  const tDashboard = await getTranslations('dashboard')

  const displayName =
    (user as unknown as { displayName?: string }).displayName || user.email

  const emailVerified = !!(user as unknown as { _verified?: boolean })._verified

  const payload = await getPayload({ config })
  const cap = await getDailyMessageCap(payload, user)
  const quota = await getQuotaStatus(user.id, cap)

  const quotaCap = quota.cap === Infinity ? null : quota.cap
  const quotaPercent = quotaCap ? Math.min(100, Math.round((quota.used / quotaCap) * 100)) : 0

  async function handleLogout() {
    'use server'
    await logoutAction()
    redirect(`/${locale}/login`)
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Unverified email warning strip */}
        {!emailVerified && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
            {t('dashboard.emailNotVerified')}
          </div>
        )}

        {/* Header row */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-1">
              Dashboard
            </p>
            <h1 className="text-3xl font-bold text-[var(--color-text)]">
              {t('dashboard.welcome', { name: displayName })}
            </h1>
          </div>

          <form action={handleLogout}>
            <button
              type="submit"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border)]"
            >
              {t('dashboard.logout')}
            </button>
          </form>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Quota card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Messages today
            </p>
            <p className="mb-4 text-2xl font-bold text-[var(--color-text)]">
              {quota.used}
              {quotaCap !== null && (
                <span className="text-base font-normal text-[var(--color-text-muted)]">
                  {' '}/ {quotaCap}
                </span>
              )}
            </p>

            {quotaCap !== null && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent-strong)] transition-all"
                    style={{ width: `${quotaPercent}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {tDashboard('quotaToday', {
                    used: quota.used,
                    cap: quotaCap,
                  })}
                </p>
              </div>
            )}

            {quotaCap !== null && (
              <Link
                href={`/${locale}/upgrade`}
                className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] underline-offset-2 hover:underline"
              >
                {tDashboard('upgrade')}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
            )}
          </div>

          {/* Start chatting CTA */}
          <Link
            href={`/${locale}/chat`}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-soft)] p-6 transition-colors hover:border-[var(--color-accent-strong)]/60 hover:bg-[var(--color-accent-soft)]/80"
          >
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]/70">
                Companions
              </p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                Start chatting
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Choose a companion and begin a conversation.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-[var(--color-accent)]">
              Open chat
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </main>
  )
}
