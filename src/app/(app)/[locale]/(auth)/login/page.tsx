import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { loginAction } from '@/features/auth/actions/login'
import { loginAsTestUserAction } from '@/features/auth/actions/test-login'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from '@/features/auth/test-login-config'
import Link from 'next/link'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; oauth_error?: string }>
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { error, oauth_error } = await searchParams
  const t = await getTranslations('auth')

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  async function handleLogin(formData: FormData) {
    'use server'
    const result = await loginAction(formData)
    if (result.success) {
      redirect(`/${locale}/dashboard`)
    }
    redirect(`/${locale}/login?error=invalid`)
  }

  async function handleDemoLogin() {
    'use server'
    const result = await loginAsTestUserAction()
    if (result.success) {
      redirect(`/${locale}/dashboard`)
    }
    redirect(`/${locale}/login?error=invalid`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-start justify-center"
      >
        <div
          style={{
            width: '500px',
            height: '400px',
            marginTop: '-100px',
            background:
              'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.1) 0%, rgba(11, 10, 16, 0) 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-[var(--color-text)]">AI Companion</span>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-2xl">
          <h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">
            {t('login.title')}
          </h1>

          {oauth_error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {t('oauthError')}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {t('login.invalidCredentials')}
            </div>
          )}

          <div className="mb-5 rounded-xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-strong)]/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                Demo mode
              </p>
              <p className="mb-3 text-sm text-[var(--color-text)]/90">
                One-click login as a test user with Premium Plus, no email needed.
              </p>
              <p className="mb-3 select-all rounded-lg bg-[var(--color-bg)]/60 px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                {TEST_USER_EMAIL} · {TEST_USER_PASSWORD}
              </p>
              <form action={handleDemoLogin}>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
                >
                  Sign in as demo user
                </button>
              </form>
            </div>

          {googleEnabled && (
            <>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/ route, not a Next.js page */}
              <a
                href="/api/users/oauth/authorize"
                className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)] hover:border-[var(--color-accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
                  <path
                    d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                    fill="#EA4335"
                  />
                </svg>
                {t('continueWithGoogle')}
              </a>

              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-xs text-[var(--color-text-muted)]">{t('or')}</span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            </>
          )}

          <form action={handleLogin} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-[var(--color-text-muted)]"
              >
                {t('login.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-[var(--color-text-muted)]"
              >
                {t('login.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--color-accent-strong)] px-4 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              {t('login.submit')}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-text-muted)]">
            {t('login.noAccount')}{' '}
            <Link
              href={`/${locale}/signup`}
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] underline-offset-2 hover:underline"
            >
              {t('login.createAccount')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
