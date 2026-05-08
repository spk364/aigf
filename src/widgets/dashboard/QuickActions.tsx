import Link from 'next/link'

type Props = {
  locale: string
  hasCompanions: boolean
  topConversationId: string | null
}

type Tile = {
  href: string
  title: string
  subtitle: string
  icon: React.ReactNode
  accent: 'pink' | 'violet' | 'amber' | 'cyan'
}

const ACCENTS: Record<Tile['accent'], string> = {
  pink: 'from-pink-500/30 via-pink-500/10 to-transparent',
  violet: 'from-violet-500/30 via-violet-500/10 to-transparent',
  amber: 'from-amber-400/30 via-amber-400/10 to-transparent',
  cyan: 'from-cyan-400/30 via-cyan-400/10 to-transparent',
}

const ACCENT_RING: Record<Tile['accent'], string> = {
  pink: 'group-hover:border-pink-400/50',
  violet: 'group-hover:border-violet-400/50',
  amber: 'group-hover:border-amber-300/50',
  cyan: 'group-hover:border-cyan-300/50',
}

function ActionTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className={
        'group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all hover:-translate-y-0.5 hover:bg-[var(--color-surface-2)] ' +
        ACCENT_RING[tile.accent]
      }
    >
      <div
        aria-hidden
        className={
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-100 ' +
          ACCENTS[tile.accent]
        }
      />
      <div className="relative">
        <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur-sm">
          {tile.icon}
        </span>
        <p className="text-sm font-bold text-[var(--color-text)]">{tile.title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{tile.subtitle}</p>
      </div>
    </Link>
  )
}

export function QuickActions({ locale, hasCompanions, topConversationId }: Props) {
  const continueHref = topConversationId
    ? `/${locale}/chat/${topConversationId}`
    : `/${locale}/chat`

  const tiles: Tile[] = [
    {
      href: hasCompanions ? continueHref : `/${locale}/explore`,
      title: hasCompanions ? 'Continue chat' : 'Browse companions',
      subtitle: hasCompanions ? 'Pick up where you left off' : 'Find your match',
      accent: 'pink',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 11-3.4-6.5L21 4l-1 4.5A8 8 0 0121 12z" />
        </svg>
      ),
    },
    {
      href: `/${locale}/start`,
      title: 'Create companion',
      subtitle: 'Design her in 4 steps',
      accent: 'violet',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7L12 3z" />
        </svg>
      ),
    },
    {
      href: `/${locale}/explore`,
      title: 'Explore gallery',
      subtitle: 'Discover new personas',
      accent: 'cyan',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 9.5l-1.4 4.4-4.4 1.4 1.4-4.4 4.4-1.4z" />
        </svg>
      ),
    },
    {
      href: `/${locale}/tokens`,
      title: 'Top up tokens',
      subtitle: 'Unlock images & video',
      accent: 'amber',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      ),
    },
  ]

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Quick actions
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <ActionTile key={tile.href} tile={tile} />
        ))}
      </div>
    </section>
  )
}
