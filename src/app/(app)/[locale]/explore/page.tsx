import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SiteHeader } from '@/widgets/site-header'
import { SiteFooter } from '@/widgets/site-footer'
import { ExploreCatalog } from '@/widgets/explore'
import { getExploreCharacters } from '@/widgets/landing'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function ExplorePage({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations('explore')
  const characters = await getExploreCharacters(locale as 'en' | 'ru' | 'es')

  return (
    <>
      <SiteHeader locale={locale} />

      <main className="relative bg-[var(--color-bg)] pt-16">
        <section className="relative overflow-hidden border-b border-white/5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
          >
            <div
              style={{
                width: '900px',
                height: '500px',
                background:
                  'radial-gradient(ellipse at center, rgba(192, 116, 255, 0.18) 0%, rgba(11, 10, 16, 0) 70%)',
                borderRadius: '50%',
              }}
            />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:py-20 sm:px-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              {t('eyebrow')}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
              {t('title')}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--color-text-muted)]">
              {t('subtitle')}
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          {characters.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 px-6 py-16 text-center">
              <h2 className="text-xl font-semibold text-[var(--color-text)]">
                {t('noneTitle')}
              </h2>
              <p className="max-w-md text-sm text-[var(--color-text-muted)]">
                {t('noneSubtitle')}
              </p>
              <Link
                href={`/${locale}/start`}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
              >
                {t('createCta')}
              </Link>
            </div>
          ) : (
            <ExploreCatalog
              locale={locale}
              characters={characters}
              strings={{
                searchPlaceholder: t('searchPlaceholder'),
                allTags: t('allTags'),
                sortFeatured: t('sort.featured'),
                sortName: t('sort.name'),
                sortRandom: t('sort.random'),
                resultsCount: t('resultsCount'),
                empty: t('empty'),
                clearFilters: t('clearFilters'),
              }}
            />
          )}
        </section>

        <section className="border-t border-white/5 bg-[var(--color-surface)]/30">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
              {t('createTitle')}
            </h2>
            <p className="max-w-xl text-base text-[var(--color-text-muted)]">
              {t('createSubtitle')}
            </p>
            <Link
              href={`/${locale}/start`}
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
            >
              {t('createCta')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </>
  )
}
