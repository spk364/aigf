import Link from 'next/link'
import type { FeaturedCharacter } from '@/widgets/landing/featured-data'

type Props = {
  locale: string
  characters: FeaturedCharacter[]
}

export function DiscoverStrip({ locale, characters }: Props) {
  if (characters.length === 0) return null
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Discover companions
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Hand-picked personas you can chat with right now
          </p>
        </div>
        <Link
          href={`/${locale}/explore`}
          className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:gap-4 [scrollbar-width:thin]">
        {characters.map((c) => (
          <Link
            key={c.id}
            href={`/${locale}/chat/new?characterId=${c.id}`}
            className="group relative block aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/50 hover:shadow-[0_18px_40px_-12px_rgba(192,116,255,0.4)] sm:w-48"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.photoUrl}
              alt={c.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="truncate text-sm font-bold text-white drop-shadow">{c.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/70">
                {c.archetype}
                {c.age != null ? ` · ${c.age}` : ''}
              </p>
            </div>
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
                <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8L10 14.9l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
              </svg>
              Featured
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
