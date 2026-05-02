import Link from 'next/link'
import { OnboardingWizard } from '@/widgets/onboarding'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function StartPage({ params }: Props) {
  const { locale } = await params

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-bg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
      >
        <div
          style={{
            width: '900px',
            height: '700px',
            marginTop: '-150px',
            background:
              'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.15) 0%, rgba(11, 10, 16, 0) 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)] text-sm font-black text-[var(--color-bg)]"
          >
            G
          </span>
          <span className="text-lg font-bold tracking-tight text-[var(--color-text)]">
            girlfriend.ai
          </span>
        </Link>
        <Link
          href={`/${locale}/login`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
        >
          Sign in
        </Link>
      </header>

      <div className="relative z-10">
        <OnboardingWizard locale={locale} />
      </div>
    </main>
  )
}
