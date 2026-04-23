import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { signupAction } from '@/features/auth/actions/signup'
import Link from 'next/link'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; field?: string }>
}

export default async function SignupPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { error, field } = await searchParams
  const t = await getTranslations('auth')

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  async function handleSignup(formData: FormData) {
    'use server'
    // Pass agreeToTerms as boolean string for zod coercion
    const agreed = formData.get('agreeToTerms')
    if (agreed === 'on') {
      formData.set('agreeToTerms', 'true')
    }
    const result = await signupAction(formData)
    if (result.success) {
      redirect(`/${locale}/dashboard`)
    }
    const params = new URLSearchParams({ error: result.error })
    if ('field' in result && result.field) params.set('field', result.field)
    redirect(`/${locale}/signup?${params.toString()}`)
  }

  const errorMessage = (() => {
    if (!error) return null
    if (error === 'underage') return t('signup.errors.underage')
    if (error === 'mustAgree') return t('signup.errors.mustAgree')
    if (error === 'passwordMismatch') return t('signup.errors.passwordMismatch')
    if (error === 'emailTaken') return t('signup.errors.emailTaken')
    return error
  })()

  const inputClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]'
  const labelClass = 'text-sm font-medium text-[var(--color-text-muted)]'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      {/* Subtle background glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 flex items-start justify-center"
      >
        <div
          style={{
            width: '500px',
            height: '400px',
            marginTop: '-80px',
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
            {t('signup.title')}
          </h1>

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

          {errorMessage && (
            <div
              role="alert"
              data-field={field}
              className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {errorMessage}
            </div>
          )}

          <form action={handleSignup} className="space-y-6">
            {/* Account credentials */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]/70 mb-3">
                Account
              </legend>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className={labelClass}>
                  {t('signup.email')}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className={labelClass}>
                  {t('signup.password')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirmPassword" className={labelClass}>
                  {t('signup.confirmPassword')}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </fieldset>

            {/* Personal info */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]/70 mb-3">
                Personal
              </legend>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="displayName" className={labelClass}>
                  {t('signup.displayName')}
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="nickname"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="dateOfBirth" className={labelClass}>
                  {t('signup.dateOfBirth')}
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  required
                  className={[
                    inputClass,
                    '[color-scheme:dark]',
                  ].join(' ')}
                />
              </div>
            </fieldset>

            {/* Consent */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]/70 mb-3">
                Consent
              </legend>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  id="agreeToTerms"
                  name="agreeToTerms"
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--color-border)] bg-[var(--color-surface-2)] accent-[var(--color-accent-strong)]"
                />
                <span className="text-sm text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors leading-relaxed">
                  {t('signup.over18')}
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  id="subscribeNewsletter"
                  name="subscribeNewsletter"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--color-border)] bg-[var(--color-surface-2)] accent-[var(--color-accent-strong)]"
                />
                <span className="text-sm text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors leading-relaxed">
                  {t('signup.subscribeNewsletter')}
                </span>
              </label>
            </fieldset>

            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--color-accent-strong)] px-4 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              {t('signup.submit')}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-text-muted)]">
            {t('signup.haveAccount')}{' '}
            <Link
              href={`/${locale}/login`}
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] underline-offset-2 hover:underline"
            >
              {t('signup.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
