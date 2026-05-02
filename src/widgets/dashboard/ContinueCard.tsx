import Link from 'next/link'
import { timeAgo } from './timeAgo'

type Props = {
  locale: string
  hero: {
    conversationId: string
    characterName: string
    characterImageUrl: string | null
    lastMessagePreview: string | null
    lastMessageAt: string | null
  }
}

function Initial({ name }: { name: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-7xl font-black text-white/20"
      style={{
        background:
          'linear-gradient(155deg, hsl(290 70% 55%) 0%, hsl(330 60% 38%) 60%, hsl(360 55% 22%) 100%)',
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function ContinueCard({ locale, hero }: Props) {
  const ago = timeAgo(hero.lastMessageAt)
  return (
    <Link
      href={`/${locale}/chat/${hero.conversationId}`}
      className="group relative block overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:border-[var(--color-accent-strong)]/40 hover:shadow-[0_24px_60px_-12px_rgba(192,116,255,0.4)]"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr]">
        <div className="relative aspect-[9/16] sm:aspect-auto sm:h-full">
          {hero.characterImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero.characterImageUrl}
              alt={hero.characterName}
              className="h-full w-full object-cover"
            />
          ) : (
            <Initial name={hero.characterName} />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
        </div>

        <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              Continue chatting
            </p>
            <h2 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              {hero.characterName}
            </h2>
            {hero.lastMessagePreview && (
              <p className="mt-3 line-clamp-2 text-[var(--color-text-muted)]">
                {hero.lastMessagePreview}
              </p>
            )}
            {ago && (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]/70">
                {ago}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--color-accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors group-hover:bg-[var(--color-accent)]">
            Open chat
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}
