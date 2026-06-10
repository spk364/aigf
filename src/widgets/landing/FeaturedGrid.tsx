import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PersonaCard } from './PersonaCard'
import { getArchetypeBuckets, getExploreCharacters } from './featured-data'

type Props = {
  locale: string
}

const TOP_CHIPS = 6
const GRID_LIMIT = 24

function formatLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}

export async function FeaturedGrid({ locale }: Props) {
  const [characters, archetypes] = await Promise.all([
    getExploreCharacters({ sort: 'featured', limit: GRID_LIMIT, locale }),
    getArchetypeBuckets(),
  ])

  if (characters.length === 0) return null

  const t = await getTranslations('landing.featured')
  const tArch = await getTranslations('builder.options.archetype')
  const archetypeLabel = (value: string) => {
    try {
      return tArch(value as never)
    } catch {
      return formatLabel(value)
    }
  }

  const chips = archetypes.slice(0, TOP_CHIPS)

  return (
    <section className="relative w-full bg-[var(--color-bg)] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              {t('eyebrow')}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
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

        {chips.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <Link
              href={`/${locale}/explore`}
              className="inline-flex items-center rounded-full border border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-strong)]/25"
            >
              {t('chipAll')}
            </Link>
            {chips.map((chip) => (
              <Link
                key={chip.value}
                href={`/${locale}/explore?arch=${encodeURIComponent(chip.value)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text)]"
              >
                {archetypeLabel(chip.value)}
                <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                  {chip.count}
                </span>
              </Link>
            ))}
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {characters.map((character) => (
            <li key={character.id} className="flex">
              <PersonaCard
                character={character}
                href={`/${locale}/pick/${character.slug}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
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
