'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

export type FilterOption = {
  value: string
  count: number
}

type Props = {
  archetypes: FilterOption[]
  artStyles: FilterOption[]
  topTags: FilterOption[]
}

const SORTS = ['featured', 'popular', 'new', 'random'] as const
type Sort = (typeof SORTS)[number]

const AGE_MIN_DEFAULT = 18
const AGE_MAX_DEFAULT = 99

function parseTagList(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseSort(raw: string | null): Sort {
  if (raw && (SORTS as readonly string[]).includes(raw)) return raw as Sort
  return 'featured'
}

function parseAge(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}

export function ExploreFiltersBar({ archetypes, artStyles, topTags }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const t = useTranslations('explore.filters')
  const tArch = useTranslations('builder.options.archetype')
  const tStyle = useTranslations('builder.options.artStyle')
  const [, startTransition] = useTransition()

  const search = params.get('q') ?? ''
  const sort = parseSort(params.get('sort'))
  const archetype = params.get('arch') ?? ''
  const artStyle = params.get('style') ?? ''
  const tags = useMemo(() => parseTagList(params.get('tags')), [params])
  const ageMin = parseAge(params.get('ageMin'), AGE_MIN_DEFAULT)
  const ageMax = parseAge(params.get('ageMax'), AGE_MAX_DEFAULT)

  const [searchDraft, setSearchDraft] = useState(search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  const updateParams = (mut: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mut(next)
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  const setParam = (key: string, value: string | null) => {
    updateParams((next) => {
      if (value && value.length > 0) next.set(key, value)
      else next.delete(key)
    })
  }

  const onSearchChange = (value: string) => {
    setSearchDraft(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setParam('q', value.trim()), 300)
  }

  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    setParam('tags', next.length > 0 ? next.join(',') : null)
  }

  const onAgeChange = (which: 'min' | 'max', value: number) => {
    const clamped = Math.max(AGE_MIN_DEFAULT, Math.min(AGE_MAX_DEFAULT, Math.round(value)))
    if (which === 'min') {
      setParam('ageMin', clamped === AGE_MIN_DEFAULT ? null : String(clamped))
    } else {
      setParam('ageMax', clamped === AGE_MAX_DEFAULT ? null : String(clamped))
    }
  }

  const hasFilters =
    !!search ||
    sort !== 'featured' ||
    !!archetype ||
    !!artStyle ||
    tags.length > 0 ||
    ageMin !== AGE_MIN_DEFAULT ||
    ageMax !== AGE_MAX_DEFAULT

  const clearAll = () => {
    setSearchDraft('')
    startTransition(() => router.replace(pathname, { scroll: false }))
  }

  const archetypeLabel = (value: string) => {
    try {
      return tArch(value as never)
    } catch {
      return formatLabel(value)
    }
  }

  const styleLabel = (value: string) => {
    try {
      return tStyle(value as never)
    } catch {
      return formatLabel(value)
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('searchPlaceholder')}</span>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 pr-10 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </label>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="hidden sm:inline">{t('sortLabel')}</span>
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value === 'featured' ? null : e.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}` as never)}
                </option>
              ))}
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              {t('clear')}
            </button>
          )}
        </div>
      </div>

      {archetypes.length > 0 && (
        <FilterChips
          label={t('archetype')}
          options={archetypes}
          selected={archetype}
          onSelect={(value) => setParam('arch', archetype === value ? null : value)}
          renderLabel={archetypeLabel}
        />
      )}

      {artStyles.length > 0 && (
        <FilterChips
          label={t('artStyle')}
          options={artStyles}
          selected={artStyle}
          onSelect={(value) => setParam('style', artStyle === value ? null : value)}
          renderLabel={styleLabel}
        />
      )}

      {topTags.length > 0 && (
        <FilterChipsMulti
          label={t('tags')}
          options={topTags}
          selected={tags}
          onToggle={toggleTag}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {t('age')}{' '}
          <span className="ml-1 text-[var(--color-text)]">
            {ageMin}–{ageMax}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <NumberInput
            label={t('ageMin')}
            value={ageMin}
            min={AGE_MIN_DEFAULT}
            max={ageMax}
            onChange={(v) => onAgeChange('min', v)}
          />
          <span className="text-[var(--color-text-muted)]">—</span>
          <NumberInput
            label={t('ageMax')}
            value={ageMax}
            min={ageMin}
            max={AGE_MAX_DEFAULT}
            onChange={(v) => onAgeChange('max', v)}
          />
        </div>
      </div>
    </div>
  )
}

type ChipsProps = {
  label: string
  options: FilterOption[]
  selected: string
  onSelect: (value: string) => void
  renderLabel: (value: string) => string
}

function FilterChips({ label, options, selected, onSelect, renderLabel }: ChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text)]'
              }`}
            >
              {renderLabel(opt.value)}
              <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                {opt.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type ChipsMultiProps = {
  label: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string) => void
}

function FilterChipsMulti({ label, options, selected, onToggle }: ChipsMultiProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text)]'
              }`}
            >
              {opt.value}
              <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                {opt.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type NumberInputProps = {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

function NumberInput({ label, value, min, max, onChange }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (!Number.isFinite(n)) {
            setDraft(String(value))
            return
          }
          onChange(n)
        }}
        className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  )
}
