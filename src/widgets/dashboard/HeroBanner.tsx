import Link from 'next/link'
import type { ActiveBanner } from './banners-data'

type Slide = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  imageUrl: string | null
  hueA: number
  hueB: number
}

type Props = {
  locale: string
  /**
   * CMS-driven banners filtered for this page. When provided and non-empty,
   * the first banner is rendered. Otherwise the built-in editorial slot is
   * used as a fallback so the layout still has a hero.
   */
  banners?: ActiveBanner[]
  /**
   * Optional cover image (e.g. featured character photo) so the fallback
   * banner has something to look at when no CMS banner is configured.
   */
  coverImageUrl?: string | null
}

const DEFAULT_BANNER: Omit<Slide, 'imageUrl'> = {
  id: 'create-companion',
  eyebrow: 'Featured',
  title: 'Design your dream companion',
  subtitle: 'Pick a look, vibe, and personality in under a minute.',
  ctaLabel: 'Create now',
  ctaHref: '/start',
  hueA: 320,
  hueB: 280,
}

function localizeHref(href: string, locale: string): string {
  if (!href) return `/${locale}`
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('/')) {
    // Avoid double-prefixing if the editor already included the locale.
    if (href === `/${locale}` || href.startsWith(`/${locale}/`)) return href
    return `/${locale}${href}`
  }
  return href
}

function bannerToSlide(b: ActiveBanner, locale: string): Slide {
  return {
    id: b.id,
    eyebrow: b.eyebrow || DEFAULT_BANNER.eyebrow,
    title: b.title || DEFAULT_BANNER.title,
    subtitle: b.subtitle || DEFAULT_BANNER.subtitle,
    ctaLabel: b.ctaLabel || DEFAULT_BANNER.ctaLabel,
    ctaHref: localizeHref(b.ctaHref || DEFAULT_BANNER.ctaHref, locale),
    imageUrl: b.imageUrl,
    hueA: b.hueA,
    hueB: b.hueB,
  }
}

export function HeroBanner({ locale, banners, coverImageUrl }: Props) {
  const cms = (banners ?? []).filter((b) => b.title)
  const slide: Slide =
    cms.length > 0
      ? bannerToSlide(cms[0]!, locale)
      : {
          ...DEFAULT_BANNER,
          ctaHref: localizeHref(DEFAULT_BANNER.ctaHref, locale),
          imageUrl: coverImageUrl ?? null,
        }

  const slideCount = Math.max(cms.length, 1)

  return (
    <section
      aria-label="Featured promotion"
      className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-raised"
    >
      <div className="relative aspect-[16/6] w-full sm:aspect-[16/5]">
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, hsl(${slide.hueA} 75% 35%) 0%, hsl(${slide.hueB} 70% 22%) 100%)`,
            }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(8,5,16,0.85) 0%, rgba(8,5,16,0.55) 45%, rgba(8,5,16,0.15) 100%)',
          }}
          aria-hidden
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, hsl(290 85% 65% / 0.55), transparent 70%)',
          }}
        />

        <div className="relative flex h-full flex-col justify-center gap-3 p-6 sm:p-10 lg:p-12">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-bg)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8L10 14.9l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
            </svg>
            {slide.eyebrow}
          </span>
          <h2 className="font-display max-w-xl text-2xl font-bold leading-tight text-white drop-shadow sm:text-4xl lg:text-5xl">
            {slide.title}
          </h2>
          <p className="max-w-md text-sm text-white/80 sm:text-base">{slide.subtitle}</p>
          <div className="mt-2">
            <Link
              href={slide.ctaHref}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-5 py-2.5 text-sm font-bold text-[var(--color-bg)] shadow-[0_18px_40px_-12px_rgba(192,116,255,0.6)] transition-colors hover:bg-[var(--color-accent)]"
            >
              {slide.ctaLabel}
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        </div>

        <div
          className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5"
          aria-hidden
        >
          {Array.from({ length: Math.min(slideCount, 5) }).map((_, i) => (
            <span
              key={i}
              className={
                i === 0
                  ? 'h-1 w-6 rounded-full bg-white'
                  : 'h-1 w-1.5 rounded-full bg-white/40'
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}
