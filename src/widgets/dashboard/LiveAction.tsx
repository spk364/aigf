'use client'

// TODO: replace with a real "live" feed once we have presence/streaming.
// Today this is a curated row of featured characters dressed up with a LIVE
// pulse + an archetype-flavored teaser that opens a chat with that persona.
import Link from 'next/link'
import { useRef } from 'react'
import type { FeaturedCharacter } from '@/widgets/landing/featured-data'

type Props = {
  locale: string
  characters: FeaturedCharacter[]
}

const TEASERS_BY_ARCHETYPE: Record<string, readonly string[]> = {
  sweet_girlfriend: ['Miss me already?', 'Come cuddle, baby', 'I saved a spot for you'],
  adventurous_spirit: ['Up for a wild night?', 'I dare you to keep up', 'Let’s break the rules'],
  mysterious_one: ['I have a secret for you…', 'Guess what I’m wearing', 'Curious yet?'],
  confident_leader: ['On your knees, please', 'I run the show tonight', 'You answer to me'],
  shy_romantic: ['…can we talk?', 'Don’t make me blush', 'I missed your voice'],
  intellectual: ['Tell me your fantasy', 'I have theories about you', 'Read me out loud'],
  free_spirit: ['Skinny dipping?', 'No plans, just us', 'Let’s get lost together'],
  caretaker: ['Rough day? Come here', 'Let me take care of you', 'Lay your head on me'],
  dominant_temptress: ['You’ve been bad', 'Beg for it', 'Eyes on me'],
  playful_brat: ['Catch me if you can', 'Try to behave', 'I’m feeling a little mean'],
}

const FALLBACK_TEASERS = [
  'I’m waiting for you',
  'Come play with me',
  'Don’t keep me waiting',
  'Tonight is just us',
  'Show me what you’ve got',
] as const

function pickTeaser(archetypeRaw: string, seed: string): string {
  const list = TEASERS_BY_ARCHETYPE[archetypeRaw] ?? FALLBACK_TEASERS
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return list[h % list.length]!
}

function LivePulse() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
    </span>
  )
}

// Per-card subcomponent so each video gets its own ref. Inlined rather than
// shared with PersonaCard / CharactersGrid because the surrounding card
// chrome (teaser line, scrollable row sizing, "Play with me" CTA) is
// LiveAction-specific.
function LiveActionCard({
  character,
  locale,
  teaser,
}: {
  character: FeaturedCharacter
  locale: string
  teaser: string
}) {
  const c = character
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Imperative play/pause keeps the autoplay constraint happy (the user's
  // pointer entering the card is a sufficient gesture for muted playback)
  // and rewinds on leave so the next hover starts from the same first
  // frame as the still photo. Catch swallows DOMException when the user
  // moves the mouse off mid-load.
  const handleEnter = () => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    void v.play().catch(() => {})
  }
  const handleLeave = () => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <Link
      href={`/${locale}/chat/new?characterId=${c.id}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className="group relative block aspect-[3/4] w-44 shrink-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/50 hover:shadow-[0_18px_40px_-12px_rgba(192,116,255,0.45)] sm:w-52"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={c.photoUrl}
        alt={c.name}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {c.videoUrl && (
        <video
          ref={videoRef}
          src={c.videoUrl}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
        <LivePulse />
        Live
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-1 text-[11px] font-medium italic text-white/85 drop-shadow">
          “{teaser}”
        </p>
        <p className="mt-1 truncate text-base font-bold text-white drop-shadow">
          {c.name}
          {c.age != null ? <span className="ml-1 font-medium text-white/70">{c.age}</span> : null}
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-[11px] font-bold text-[var(--color-bg)] shadow-[0_10px_25px_-8px_rgba(192,116,255,0.7)]">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          Play with me
        </span>
      </div>
    </Link>
  )
}

export function LiveAction({ locale, characters }: Props) {
  if (characters.length === 0) return null

  return (
    <section aria-labelledby="live-action-heading">
      <div className="mb-3 flex items-baseline gap-2">
        <h2
          id="live-action-heading"
          className="text-xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-2xl"
        >
          <span className="text-[var(--color-accent)]">Jump into</span>{' '}
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-base font-bold text-emerald-300 sm:text-lg">
            <LivePulse />
            LIVE
          </span>{' '}
          ACTION
        </h2>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          Beta
        </span>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:gap-4 [scrollbar-width:thin]">
        {characters.map((c) => (
          <LiveActionCard
            key={c.id}
            character={c}
            locale={locale}
            teaser={pickTeaser(c.archetypeRaw, c.id)}
          />
        ))}
      </div>
    </section>
  )
}
