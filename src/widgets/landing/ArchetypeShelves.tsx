import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PersonaCard } from './PersonaCard'
import {
  getArchetypeBuckets,
  getExploreCharacters,
  type FeaturedCharacter,
} from './featured-data'

type Props = {
  locale: string
}

const MAX_SHELVES = 5
const PER_SHELF = 8

function formatLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}

export async function ArchetypeShelves({ locale }: Props) {
  const buckets = await getArchetypeBuckets()
  if (buckets.length === 0) return null

  const t = await getTranslations('landing.shelves')
  const tArch = await getTranslations('builder.options.archetype')

  const topBuckets = buckets.slice(0, MAX_SHELVES)

  const shelves = await Promise.all(
    topBuckets.map(async (bucket) => {
      const items = await getExploreCharacters({
        archetype: bucket.value,
        sort: 'featured',
        limit: PER_SHELF,
        locale,
      })
      return { bucket, items }
    }),
  )

  const archetypeLabel = (value: string) => {
    try {
      return tArch(value as never)
    } catch {
      return formatLabel(value)
    }
  }

  return (
    <section className="relative w-full bg-[var(--color-bg)] py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              {t('eyebrow')}
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              {t('title')}
            </h2>
            <p className="mt-2 max-w-xl text-[var(--color-text-muted)]">{t('subtitle')}</p>
          </div>
          <Link
            href={`/${locale}/explore`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            {t('browseAll')}
            <ArrowIcon />
          </Link>
        </div>

        <div className="flex flex-col gap-12">
          {shelves.map(({ bucket, items }) =>
            items.length === 0 ? null : (
              <Shelf
                key={bucket.value}
                title={archetypeLabel(bucket.value)}
                count={bucket.count}
                href={`/${locale}/explore?arch=${encodeURIComponent(bucket.value)}`}
                items={items}
                locale={locale}
                seeAllLabel={t('seeAll')}
              />
            ),
          )}
        </div>
      </div>
    </section>
  )
}

type ShelfProps = {
  title: string
  count: number
  href: string
  items: FeaturedCharacter[]
  locale: string
  seeAllLabel: string
}

function Shelf({ title, count, href, items, locale, seeAllLabel }: ShelfProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-xl font-bold text-[var(--color-text)] sm:text-2xl">{title}</h3>
          <span className="text-sm text-[var(--color-text-muted)]">{count}</span>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-strong)]"
        >
          {seeAllLabel}
          <ArrowIcon />
        </Link>
      </div>
      <div className="-mx-4 sm:mx-0">
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {items.map((character) => (
            <li
              key={character.id}
              className="flex w-[68vw] shrink-0 snap-start sm:w-[280px] lg:w-[300px]"
            >
              <PersonaCard
                character={character}
                href={`/${locale}/pick/${character.slug}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  )
}
