'use client'

// Candy.ai-style "Characters" block: search input, scrollable category chips,
// and a card grid. Filtering is client-side over a server-provided slice of
// featured characters — for the full catalog, the "View all" link points at
// /explore where we already have proper server-side filters.
import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { FeaturedCharacter } from '@/widgets/landing/featured-data'
import { useAutoplayInView } from '@/widgets/landing/use-autoplay-in-view'

type Props = {
  locale: string
  characters: FeaturedCharacter[]
}

type Category = {
  key: string
  label: string
  match: (c: FeaturedCharacter) => boolean
}

const ALL_CATEGORY: Category = {
  key: 'all',
  label: 'All',
  match: () => true,
}

function tagMatches(c: FeaturedCharacter, needles: readonly string[]): boolean {
  const haystack = [...c.tags, c.archetypeRaw].map((t) => t.toLowerCase())
  return needles.some((n) => haystack.some((h) => h.includes(n)))
}

const CATEGORIES: readonly Category[] = [
  ALL_CATEGORY,
  { key: 'caucasian', label: 'Caucasian', match: (c) => tagMatches(c, ['caucasian', 'european', 'white']) },
  { key: 'latina', label: 'Latina', match: (c) => tagMatches(c, ['latina', 'latino', 'hispanic']) },
  { key: 'asian', label: 'Asian', match: (c) => tagMatches(c, ['asian', 'japanese', 'korean', 'chinese']) },
  { key: '18-21', label: '18-21', match: (c) => c.age != null && c.age >= 18 && c.age <= 21 },
  { key: 'blonde', label: 'Blonde', match: (c) => tagMatches(c, ['blonde']) },
  { key: 'brunette', label: 'Brunette', match: (c) => tagMatches(c, ['brunette', 'brown_hair']) },
  { key: 'redhead', label: 'Redhead', match: (c) => tagMatches(c, ['redhead', 'red_hair', 'ginger']) },
  { key: 'milf', label: 'Milf', match: (c) => tagMatches(c, ['milf', 'mature']) || (c.age != null && c.age >= 35) },
  { key: 'arab', label: 'Arab', match: (c) => tagMatches(c, ['arab', 'middle_eastern', 'persian']) },
  { key: 'ebony', label: 'Ebony', match: (c) => tagMatches(c, ['ebony', 'black', 'african']) },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  )
}

export function CharactersGrid({ locale, characters }: Props) {
  const [active, setActive] = useState<string>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === active) ?? ALL_CATEGORY
    const q = query.trim().toLowerCase()
    return characters.filter((c) => {
      if (!cat.match(c)) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q) ||
        c.archetype.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [characters, active, query])

  return (
    <section aria-labelledby="characters-heading">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2
          id="characters-heading"
          className="text-xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-2xl"
        >
          <span className="text-[var(--color-accent)]">girlfriend.ai</span> Characters
        </h2>
        <Link
          href={`/${locale}/explore`}
          className="shrink-0 text-sm text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex w-full items-center sm:w-72">
          <span className="pointer-events-none absolute left-3 text-[var(--color-text-muted)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-strong)]/60 focus:outline-none"
          />
        </label>
        <div className="-mx-1 flex flex-1 items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:thin]">
          {CATEGORIES.map((cat) => {
            const isActive = active === cat.key
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActive(cat.key)}
                aria-pressed={isActive}
                className={
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ' +
                  (isActive
                    ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]')
                }
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--color-text)]">No matches yet</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Try a different category or clear your search.
          </p>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => (
            <li key={c.id}>
              <CharacterTileCard character={c} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Per-card subcomponent so each card owns its own video ref. Video starts
// auto-playing when the card scrolls into view (IntersectionObserver in
// useAutoplayInView). Cards without a videoUrl render only the photo
// and behave as before.
function CharacterTileCard({
  character,
  locale,
}: {
  character: FeaturedCharacter
  locale: string
}) {
  const c = character
  const { ref: videoRef, hasFirstFrame } = useAutoplayInView()

  return (
    <Link
      href={`/${locale}/pick/${c.slug}`}
      className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/50 hover:shadow-[0_18px_40px_-12px_rgba(192,116,255,0.4)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.photoUrl}
        alt={c.name}
        loading="lazy"
        className={
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
          (c.videoUrl && hasFirstFrame ? 'opacity-0' : 'opacity-100')
        }
      />
      {c.videoUrl && (
        <video
          ref={videoRef}
          src={c.videoUrl}
          muted
          loop
          playsInline
          preload="metadata"
          poster={c.photoUrl}
          aria-hidden
          className={
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
            (hasFirstFrame ? 'opacity-100' : 'opacity-0')
          }
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Online
      </span>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="truncate text-sm font-bold text-white drop-shadow">
          {c.name}
          {c.age != null ? <span className="ml-1 font-medium text-white/70">{c.age}</span> : null}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-white/70">{c.archetype}</p>
      </div>
    </Link>
  )
}
