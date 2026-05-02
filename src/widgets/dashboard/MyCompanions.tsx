import Link from 'next/link'
import type { CompanionCard } from '@/features/dashboard/queries'
import { timeAgo } from './timeAgo'

type Props = {
  locale: string
  companions: CompanionCard[]
}

function GradientFallback({ name }: { name: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-6xl font-black text-white/20"
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

function CompanionTile({ locale, companion }: { locale: string; companion: CompanionCard }) {
  const href = companion.conversationId
    ? `/${locale}/chat/${companion.conversationId}`
    : `/${locale}/chat/new?characterId=${companion.id}`
  const ago = timeAgo(companion.lastMessageAt)
  return (
    <Link
      href={href}
      className="group relative block aspect-[9/16] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/40 hover:shadow-[0_18px_40px_-10px_rgba(192,116,255,0.35)]"
    >
      {companion.primaryImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={companion.primaryImageUrl}
          alt={companion.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <GradientFallback name={companion.name} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/0" />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="text-base font-bold text-white drop-shadow">{companion.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
          {companion.archetype && (
            <span className="capitalize">{companion.archetype.replace(/_/g, ' ')}</span>
          )}
          {ago && (
            <>
              <span aria-hidden>·</span>
              <span>{ago}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

function CreateNewTile({ locale }: { locale: string }) {
  return (
    <Link
      href={`/${locale}/start`}
      className="group flex aspect-[9/16] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 text-center transition-all hover:border-[var(--color-accent-strong)]/60 hover:bg-[var(--color-surface)]"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent-strong)]/15 text-[var(--color-accent-strong)] transition-colors group-hover:bg-[var(--color-accent-strong)] group-hover:text-[var(--color-bg)]">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-6 w-6">
          <path
            fillRule="evenodd"
            d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      <p className="text-sm font-semibold text-[var(--color-text)]">Create new</p>
      <p className="text-xs text-[var(--color-text-muted)]">Design your own companion</p>
    </Link>
  )
}

export function MyCompanions({ locale, companions }: Props) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Your companions</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {companions.length} {companions.length === 1 ? 'companion' : 'companions'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {companions.map((c) => (
          <CompanionTile key={c.id} locale={locale} companion={c} />
        ))}
        <CreateNewTile locale={locale} />
      </div>
    </section>
  )
}
