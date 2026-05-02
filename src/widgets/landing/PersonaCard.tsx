import Link from 'next/link'
import { type CSSProperties } from 'react'
import type { FeaturedPersona } from './personas'

type Props = {
  persona: FeaturedPersona
  href: string
}

export function PersonaCard({ persona, href }: Props) {
  const { name, age, city, archetype, tagline, tags, hue } = persona
  const initial = name.charAt(0)
  const tileStyle: CSSProperties = {
    background: `linear-gradient(155deg, hsl(${hue} 70% 55%) 0%, hsl(${(hue + 35) % 360} 60% 38%) 55%, hsl(${(hue + 70) % 360} 55% 22%) 100%)`,
  }

  return (
    <Link
      href={href}
      className="group relative flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-1 hover:border-[var(--color-accent-strong)]/50 hover:shadow-[0_18px_50px_-12px_rgba(192,116,255,0.35)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden" style={tileStyle}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />

        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/75">
              {archetype}
            </p>
            <p className="text-2xl font-bold text-white drop-shadow">
              {name}, {age}
            </p>
            <p className="text-xs text-white/80">{city}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-base font-bold uppercase text-white backdrop-blur-sm">
            {initial}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm leading-snug text-[var(--color-text)]/90 line-clamp-2">
          “{tagline}”
        </p>
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-accent)] transition-colors group-hover:text-[var(--color-accent-strong)]">
          Start chatting
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
    </Link>
  )
}
