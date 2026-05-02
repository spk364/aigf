import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { AvatarGrid } from '@/widgets/avatar-grid'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations('common')

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--color-bg)] px-4 text-center">
      <AvatarGrid />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          style={{
            width: '700px',
            height: '700px',
            background:
              'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.22) 0%, rgba(11, 10, 16, 0) 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          {t('hello')}
        </p>

        <h1 className="text-5xl font-bold leading-tight tracking-tight text-[var(--color-text)] sm:text-7xl">
          Meet your{' '}
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] bg-clip-text text-transparent">
            AI companion
          </span>
        </h1>

        <p className="max-w-md text-lg leading-relaxed text-[var(--color-text-muted)]">
          A companion who listens, understands, and is always here — whenever you need them.
        </p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href={`/${locale}/signup`}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-8 py-3.5 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            Get started free
          </Link>
          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-8 py-3.5 font-medium text-[var(--color-text)] backdrop-blur-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
