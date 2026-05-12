'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useAutoplayInView } from './use-autoplay-in-view'

export type FeaturedCharacter = {
  id: string
  slug: string
  name: string
  age: number | null
  city: string | null
  archetype: string
  tagline: string
  tags: string[]
  photoUrl: string
  videoUrl: string | null
  greetingAudioUrl?: string | null
  hue: number
}

type Props = {
  character: FeaturedCharacter
  href: string
}

export function PersonaCard({ character, href }: Props) {
  const { name, age, city, archetype, tagline, tags, photoUrl, videoUrl, greetingAudioUrl, hue } = character
  const videoRef = useAutoplayInView()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const tileStyle: CSSProperties = {
    background: `linear-gradient(155deg, hsl(${hue} 70% 35%) 0%, hsl(${(hue + 35) % 360} 60% 22%) 100%)`,
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const togglePlay = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!greetingAudioUrl) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playing) {
      setPlaying(false)
      return
    }
    const audio = new Audio(greetingAudioUrl)
    audio.addEventListener('ended', () => setPlaying(false))
    audio.addEventListener('error', () => setPlaying(false))
    audio.play().catch(() => setPlaying(false))
    audioRef.current = audio
    setPlaying(true)
  }

  return (
    <Link
      href={href}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-1 hover:border-[var(--color-accent-strong)]/50 hover:shadow-[0_18px_50px_-12px_rgba(192,116,255,0.35)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden" style={tileStyle}>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={photoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/0" />

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {greetingAudioUrl && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? `Stop ${name}'s voice` : `Play ${name}'s voice`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-[var(--color-accent-strong)]/80"
            >
              {playing ? (
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                  <rect x="5" y="4" width="3" height="12" rx="1" />
                  <rect x="12" y="4" width="3" height="12" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5 translate-x-px">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              )}
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
            {archetype}
          </p>
          <p className="text-2xl font-bold text-white drop-shadow">
            {name}
            {age != null ? `, ${age}` : ''}
          </p>
          {city && <p className="text-xs text-white/85">{city}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {tagline && (
          <p className="line-clamp-2 text-sm leading-snug text-[var(--color-text)]/90">
            “{tagline}”
          </p>
        )}
        {tags.length > 0 && (
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
        )}
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
