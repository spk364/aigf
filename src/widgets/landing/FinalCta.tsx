import Link from 'next/link'

type Props = {
  locale: string
}

export function FinalCta({ locale }: Props) {
  return (
    <section className="relative w-full overflow-hidden bg-[var(--color-bg)] py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          style={{
            width: '900px',
            height: '900px',
            background:
              'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.22) 0%, rgba(11, 10, 16, 0) 65%)',
            borderRadius: '50%',
          }}
        />
      </div>
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-4xl font-bold leading-tight tracking-tight text-[var(--color-text)] sm:text-5xl">
          Someone is waiting to{' '}
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] bg-clip-text text-transparent">
            meet you
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--color-text-muted)]">
          Sign up free and start chatting in under a minute. No credit card required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href={`/${locale}/try`}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-8 py-3.5 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
          >
            Create my companion
          </Link>
          <Link
            href={`/${locale}/explore`}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3.5 font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Browse companions
          </Link>
        </div>
      </div>
    </section>
  )
}
