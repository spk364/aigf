import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { SiteHeader } from '@/widgets/site-header'
import { SiteFooter } from '@/widgets/site-footer'
import { PersonaCard } from '@/widgets/landing/PersonaCard'
import { ExploreFiltersBar } from '@/widgets/explore'
import {
  getArchetypeBuckets,
  getArtStyleBuckets,
  getExploreCharacters,
  getTopTags,
  type ExploreSort,
} from '@/widgets/landing/featured-data'

type SearchParamValue = string | string[] | undefined

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, SearchParamValue>>
}

const SORT_VALUES: readonly ExploreSort[] = ['featured', 'popular', 'new', 'random']

function pickString(v: SearchParamValue): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v[0]
  return undefined
}

function pickSort(v: SearchParamValue): ExploreSort {
  const s = pickString(v)
  return s && (SORT_VALUES as readonly string[]).includes(s) ? (s as ExploreSort) : 'featured'
}

function pickInt(v: SearchParamValue): number | null {
  const s = pickString(v)
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function pickList(v: SearchParamValue): string[] {
  const s = pickString(v)
  if (!s) return []
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export default async function ExplorePage({ params, searchParams }: Props) {
  const { locale } = await params
  const sp = await searchParams
  const t = await getTranslations('explore')

  const search = pickString(sp.q) ?? ''
  const archetype = pickString(sp.arch) ?? null
  const artStyle = pickString(sp.style) ?? null
  const tags = pickList(sp.tags)
  const sort = pickSort(sp.sort)
  const ageMin = pickInt(sp.ageMin)
  const ageMax = pickInt(sp.ageMax)

  const [characters, archetypeBuckets, artStyleBuckets, topTags] = await Promise.all([
    getExploreCharacters({
      search,
      archetype,
      artStyle,
      tags,
      sort,
      ageMin,
      ageMax,
      limit: 96,
      locale,
    }),
    getArchetypeBuckets(),
    getArtStyleBuckets(),
    getTopTags(16),
  ])

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="flex flex-col bg-[var(--color-bg)] pt-16">
        <section className="relative w-full bg-gradient-to-b from-[var(--color-surface)]/40 to-transparent py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                {t('eyebrow')}
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
                {t('title')}
              </h1>
              <p className="max-w-2xl text-[var(--color-text-muted)]">{t('subtitle')}</p>
            </div>
          </div>
        </section>

        <section className="w-full pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <ExploreFiltersBar
              archetypes={archetypeBuckets}
              artStyles={artStyleBuckets}
              topTags={topTags}
            />

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-muted)]">
                {t('resultCount', { count: characters.length })}
              </p>
            </div>

            {characters.length === 0 ? (
              <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-16 text-center">
                <p className="text-lg font-semibold text-[var(--color-text)]">
                  {t('emptyTitle')}
                </p>
                <p className="max-w-md text-sm text-[var(--color-text-muted)]">
                  {t('emptySubtitle')}
                </p>
                <Link
                  href={`/${locale}/explore`}
                  className="mt-3 inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  {t('clearFilters')}
                </Link>
              </div>
            ) : (
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {characters.map((character) => (
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
        </section>
      </main>

      <SiteFooter locale={locale} />
    </>
  )
}
