import Link from 'next/link'
import type { PickCharacter } from './character-data'

type Strings = {
  eyebrow: string
  headline: string
  subheadline: string
  signUp: string
  signIn: string
  noAccount: string
  back: string
}

type Props = {
  locale: string
  character: PickCharacter
  next: string
  strings: Strings
}

export function CharacterAuthPrompt({ locale, character, next, strings }: Props) {
  const nextParam = encodeURIComponent(next)
  const loginHref = `/${locale}/login?next=${nextParam}`
  const signupHref = `/${locale}/signup?next=${nextParam}`

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
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
              'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.18) 0%, rgba(11, 10, 16, 0) 70%)',
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
          <span className="text-lg font-bold tracking-tight">girlfriend.ai</span>
        </Link>
        <Link
          href={`/${locale}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
        >
          {strings.back}
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 pb-16 pt-6 sm:px-6 md:flex-row md:items-stretch md:gap-12 md:py-16">
        {/* Character photo */}
        <div className="w-full max-w-sm md:w-[360px] md:shrink-0">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_30px_80px_-20px_rgba(192,116,255,0.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={character.photoUrl}
              alt={character.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Online
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
                {character.archetype}
              </p>
              <p className="text-3xl font-bold text-white drop-shadow">
                {character.name}
                {character.age != null ? `, ${character.age}` : ''}
              </p>
              {character.city && <p className="text-sm text-white/85">{character.city}</p>}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex w-full flex-1 flex-col justify-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            {strings.eyebrow}
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {strings.headline.replace('{name}', character.name)}
          </h1>
          {character.tagline && (
            <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--color-text-muted)]">
              “{character.tagline}”
            </p>
          )}
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
            {strings.subheadline}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={signupHref}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
            >
              {strings.signUp}
            </Link>
            <Link
              href={loginHref}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              {strings.signIn}
            </Link>
          </div>

          <p className="mt-6 text-xs text-[var(--color-text-muted)]">{strings.noAccount}</p>
        </div>
      </section>
    </main>
  )
}
