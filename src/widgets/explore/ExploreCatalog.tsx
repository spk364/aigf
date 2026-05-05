'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { PersonaCard, type FeaturedCharacter } from '@/widgets/landing'

type SortKey = 'featured' | 'name' | 'random'

type Props = {
  characters: FeaturedCharacter[]
  locale: string
  strings: {
    searchPlaceholder: string
    allTags: string
    sortFeatured: string
    sortName: string
    sortRandom: string
    resultsCount: string
    empty: string
    clearFilters: string
  }
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function ExploreCatalog({ characters, locale, strings }: Props) {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('featured')
  const deferredQuery = useDeferredValue(query)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of characters) {
      for (const t of c.tags) {
        const tag = t.trim().toLowerCase()
        if (!tag) continue
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([tag]) => tag)
  }, [characters])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    let list = characters.filter((c) => {
      if (activeTag) {
        const lower = c.tags.map((t) => t.toLowerCase())
        if (!lower.includes(activeTag)) return false
      }
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q) ||
        c.archetype.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    })

    if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === 'random') {
      list = shuffle(list, characters.length)
    }
    return list
  }, [characters, deferredQuery, activeTag, sort])

  const isFiltered = activeTag !== null || query.trim().length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex flex-1 items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--color-text-muted)]"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={strings.searchPlaceholder}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-strong)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-strong)]/20"
          />
        </label>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
            <span className="text-[var(--color-text-muted)]">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="cursor-pointer bg-transparent text-[var(--color-text)] focus:outline-none"
            >
              <option value="featured">{strings.sortFeatured}</option>
              <option value="name">{strings.sortName}</option>
              <option value="random">{strings.sortRandom}</option>
            </select>
          </label>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            aria-pressed={activeTag === null}
            className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
              activeTag === null
                ? 'bg-[var(--color-accent-strong)] text-[var(--color-bg)]'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
            }`}
          >
            {strings.allTags}
          </button>
          {allTags.map((tag) => {
            const active = activeTag === tag
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(active ? null : tag)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                  active
                    ? 'bg-[var(--color-accent-strong)] text-[var(--color-bg)]'
                    : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        {strings.resultsCount.replace('{count}', String(filtered.length))}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 px-6 py-16 text-center">
          <p className="text-base text-[var(--color-text)]">{strings.empty}</p>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setActiveTag(null)
              }}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              {strings.clearFilters}
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((character) => (
            <li key={character.id} className="flex">
              <PersonaCard
                character={character}
                href={`/${locale}/pick/${character.slug}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
