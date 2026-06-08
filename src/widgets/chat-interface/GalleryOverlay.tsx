'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GalleryItem } from '@/features/media/character-gallery'

export type GalleryOverlayStrings = {
  title: string
  countLabel: string // "{n} photos"
  empty: string
  emptyHint: string
  close: string
}

type Props = {
  open: boolean
  onClose: () => void
  conversationId: string
  strings: GalleryOverlayStrings
}

function IconClose() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
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

/**
 * Character gallery rendered as a modal over the chat (no navigation). Fetches
 * the per-conversation gallery on open; clicking a thumbnail opens an inner
 * lightbox with arrow/Escape navigation.
 */
export function GalleryOverlay({ open, onClose, conversationId, strings: s }: Props) {
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // Fetch when opened (and refetch each open so freshly-generated photos show).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/gallery`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: GalleryItem[] }) => {
        if (!cancelled) setItems(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, conversationId])

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const close = useCallback(() => {
    setActiveIndex(null)
    onClose()
  }, [onClose])

  const count = items?.length ?? 0
  const showPrev = useCallback(() => {
    setActiveIndex((i) => (i === null || count === 0 ? null : (i - 1 + count) % count))
  }, [count])
  const showNext = useCallback(() => {
    setActiveIndex((i) => (i === null || count === 0 ? null : (i + 1) % count))
  }, [count])

  // Escape closes the lightbox first, then the overlay; arrows navigate.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeIndex !== null) setActiveIndex(null)
        else close()
      } else if (activeIndex !== null && e.key === 'ArrowLeft') showPrev()
      else if (activeIndex !== null && e.key === 'ArrowRight') showNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, activeIndex, close, showPrev, showNext])

  if (!open) return null

  const active = activeIndex === null || !items ? null : items[activeIndex]
  const caption = count > 0 ? s.countLabel.replace('{n}', String(count)) : ''

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--color-bg)]/95 backdrop-blur-md animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--color-text)] sm:text-lg">{s.title}</h2>
          {caption && <p className="truncate text-xs text-[var(--color-text-muted)]">{caption}</p>}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={s.close}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95"
        >
          <IconClose />
        </button>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          {loading && items === null ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-[var(--color-surface-2)]/60" />
              ))}
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 py-20 text-center">
              <IconImages />
              <p className="text-sm font-medium text-[var(--color-text)]">{s.empty}</p>
              <p className="max-w-xs text-xs text-[var(--color-text-muted)]">{s.emptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {items!.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
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
        </div>
      </div>

      {/* Lightbox (above the overlay) */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setActiveIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setActiveIndex(null)}
            aria-label={s.close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <IconClose />
          </button>
          {count > 1 && (
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
