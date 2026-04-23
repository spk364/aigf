import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { track } from '@/shared/analytics/posthog'
import { getCurrentUser } from '@/shared/auth/current-user'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { token } = await searchParams
  const t = await getTranslations('auth')

  let success = false

  if (token) {
    try {
      const payload = await getPayload({ config })
      success = await payload.verifyEmail({
        collection: 'users',
        token,
      })
      if (success) {
        const user = await getCurrentUser()
        if (user) {
          track({ userId: String(user.id), event: 'user.email_verified', properties: { locale } })
        }
      }
    } catch {
      success = false
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div
          className={[
            'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl',
            success
              ? 'bg-[var(--color-success)]/10'
              : token
                ? 'bg-[var(--color-danger)]/10'
                : 'bg-[var(--color-accent-soft)]',
          ].join(' ')}
        >
          {success ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-7 w-7 text-[var(--color-success)]"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : token ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-7 w-7 text-[var(--color-danger)]"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-7 w-7 text-[var(--color-accent)]"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          )}
        </div>

        <h1 className="mb-3 text-2xl font-bold text-[var(--color-text)]">
          {success ? t('verifyEmail.success') : t('verifyEmail.failure')}
        </h1>

        {!token && (
          <p className="mb-6 text-sm text-[var(--color-text-muted)]">{t('verifyEmail.checkInbox')}</p>
        )}

        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          {t('login.title')}
        </Link>
      </div>
    </main>
  )
}
