// TODO: replace with real Stories collection: per-character short photo/video
// snippets with a 24h TTL, viewed-state per user, and a fullscreen viewer.
// For MVP we render circular previews of featured personas — clicking opens
// a chat with that persona, mirroring candy.ai's behavior.
import Link from 'next/link'
import type { FeaturedCharacter } from '@/widgets/landing/featured-data'

type Props = {
  locale: string
  characters: FeaturedCharacter[]
}

export function StoriesRow({ locale, characters }: Props) {
  if (characters.length === 0) return null

  return (
    <section aria-label="Stories">
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 sm:gap-5 [scrollbar-width:thin]">
        {characters.map((c, i) => (
          <Link
            key={c.id}
            href={`/${locale}/chat/new?characterId=${c.id}`}
            className="group flex w-[68px] shrink-0 animate-fade-in-up flex-col items-center gap-1.5 sm:w-[76px]"
            style={{ animationDelay: `${Math.min(i, 11) * 40}ms` }}
          >
            <span
              className="relative grid h-[64px] w-[64px] place-items-center rounded-full p-[2px] sm:h-[72px] sm:w-[72px]"
              style={{
                background:
                  'conic-gradient(from 220deg, var(--color-accent) 0deg, var(--color-accent-strong) 140deg, var(--color-accent) 360deg)',
              }}
            >
              <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.photoUrl}
                  alt={c.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
            </span>
            <span className="block w-full truncate text-center text-[11px] font-medium text-[var(--color-text)]">
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
