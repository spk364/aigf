'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { GalleryItem } from '@/features/media/character-gallery'

export type CharacterGalleryStrings = {
  title: string
  // Pre-interpolated by the page: countLabel when there are items, otherwise
  // the empty subtitle. The widget just renders it.
  caption: string
  backToChat: string
  empty: string
  emptyHint: string
  close: string
}

type Props = {
  items: GalleryItem[]
  backHref: string
  strings: CharacterGalleryStrings
}

function IconChevronLeft() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function IconImages() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10 opacity-40" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  )
}

export function CharacterGallery({ items, backHref, strings: s }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const open = useCallback((i: number) => setActiveIndex(i), [])
  const close = useCallback(() => setActiveIndex(null), [])

  const showPrev = useCallback(() => {
    setActiveIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length))
  }, [items.length])
  const showNext = useCallback(() => {
    setActiveIndex((i) => (i === null ? null : (i + 1) % items.length))
  }, [items.length])

  // Keyboard nav for the lightbox.
  useEffect(() => {
    if (activeIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') showPrev()
      else if (e.key === 'ArrowRight') showNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIndex, close, showPrev, showNext])

  const active = activeIndex === null ? null : items[activeIndex]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-16 pt-4 sm:px-6">
      {/* Header */}
      <header className="mb-5 flex items-center gap-3">
        <Link
          href={backHref}
          aria-label={s.backToChat}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95"
        >
          <IconChevronLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-[var(--color-text)] sm:text-xl">
            {s.title}
          </h1>
          <p className="truncate text-xs text-[var(--color-text-muted)] sm:text-sm">
            {s.caption}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 py-20 text-center">
          <IconImages />
          <p className="text-sm font-medium text-[var(--color-text)]">{s.empty}</p>
          <p className="max-w-xs text-xs text-[var(--color-text-muted)]">{s.emptyHint}</p>
          <Link
            href={backHref}
            className="mt-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-105 active:scale-95"
          >
            {s.backToChat}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(i)}
              className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/5 bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={close}
            aria-label={s.close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <IconClose />
          </button>

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); showPrev() }}
                aria-label="Previous"
                className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
              >
                <IconChevronLeft />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); showNext() }}
                aria-label="Next"
                className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
              >
                <span className="rotate-180"><IconChevronLeft /></span>
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}
