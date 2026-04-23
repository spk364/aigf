import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/shared/auth/require-auth'
import { completeProfileAction } from '@/features/auth/actions/complete-profile'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; field?: string }>
}

export default async function CompleteProfilePage({ params, searchParams }: Props) {
  const { locale } = await params
  const { error, field } = await searchParams
  const t = await getTranslations('completeProfile')

  // requireAuth — NOT requireCompleteProfile (that would create a redirect loop)
  const user = await requireAuth()

  // If DOB is already set, skip to dashboard
  const dateOfBirth = (user as unknown as { dateOfBirth?: string | null }).dateOfBirth
  if (dateOfBirth) {
    redirect(`/${locale}/dashboard`)
  }

  const inputClass =
    'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] [color-scheme:dark]'
  const labelClass = 'text-sm font-medium text-[var(--color-text-muted)]'

  const errorMessage = (() => {
    if (!error) return null
    if (error === 'underage') return t('errors.underage')
    if (error === 'mustAgree') return t('errors.mustAgree')
    return error
  })()

  async function handleSubmit(formData: FormData) {
    'use server'
    const agreed = formData.get('agreeToTerms')
    if (agreed === 'on') {
      formData.set('agreeToTerms', 'true')
    }
    const result = await completeProfileAction(formData)
    if (!result.success) {
      const params = new URLSearchParams({ error: result.error })
      if (result.field) params.set('field', result.field)
      redirect(`/${locale}/complete-profile?${params.toString()}`)
    }
    // On success completeProfileAction redirects to dashboard
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      {/* Background glow */}
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
          <h1 className="mb-2 text-xl font-semibold text-[var(--color-text)]">{t('title')}</h1>
          <p className="mb-6 text-sm text-[var(--color-text-muted)]">{t('subtitle')}</p>

          {errorMessage && (
            <div
              role="alert"
              data-field={field}
              className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {errorMessage}
            </div>
          )}

          <form action={handleSubmit} className="space-y-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dateOfBirth" className={labelClass}>
                {t('dateOfBirth')}
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                required
                className={inputClass}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                id="agreeToTerms"
                name="agreeToTerms"
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--color-border)] bg-[var(--color-surface-2)] accent-[var(--color-accent-strong)]"
              />
              <span className="text-sm text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors leading-relaxed">
                {t('over18')}
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--color-accent-strong)] px-4 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              {t('submit')}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
