'use client'

import { useEffect, useRef } from 'react'

type Props = {
  photoUrl: string
  videoUrl: string | null
  alt: string
  // Sized + positioned by the parent. Typically
  // `absolute inset-0 h-full w-full object-cover`.
  className: string
}

// Yo-yo / ping-pong playback: forward to end → manual reverse to start
// → forward again. Eliminates the loop seam entirely because playback
// never wraps from last frame to first frame; the join is always on
// the same frame in both directions, so visually it's a continuous
// back-and-forth motion with no jump-cut to mask.
//
// Reverse is implemented with requestAnimationFrame + currentTime
// decrement because no browser ships negative playbackRate. Short
// (~3-6 s) WAN-generated clips reverse smoothly on Chromium / Safari;
// keyframe density determines how clean it looks. Heavy scrubbing on
// long videos would stall the decoder, so this component is
// intentionally scoped to short character previews.
//
// IntersectionObserver pauses both directions when the card scrolls
// out of view and resumes in whichever direction was active when it
// comes back, so we don't burn CPU decoding offscreen and we don't
// reset users' progress through a clip when they scroll past it.
//
// Falls back to a plain <img> when the character has no clip yet.
export function CharacterCardMedia({ photoUrl, videoUrl, alt, className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // Local mutable state for the playback loop. Kept in closure
    // (rather than refs) because nothing in the JSX needs to read it.
    let rafId: number | null = null
    let direction: 'forward' | 'reverse' = 'forward'
    let lastTickMs = 0
    // Cap reverse to ~30 fps. Each currentTime write triggers a seek;
    // at 60 fps the H.264 decoder stalls on clips with sparse keyframes
    // (every assignment forces it to walk forward from the previous
    // keyframe). 30 fps still reads as smooth motion.
    const REVERSE_FPS = 30
    const REVERSE_FRAME_MS = 1000 / REVERSE_FPS

    const cancelReverse = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }

    const reverseTick = (now: number) => {
      if (direction !== 'reverse') {
        rafId = null
        return
      }
      const elapsed = now - lastTickMs
      if (elapsed < REVERSE_FRAME_MS) {
        rafId = requestAnimationFrame(reverseTick)
        return
      }
      lastTickMs = now
      const next = v.currentTime - elapsed / 1000
      if (next <= 0) {
        // Hit the start — flip direction and let native playback take
        // over until the next `ended` event. Setting currentTime = 0
        // explicitly rather than just calling play() because the latter
        // can resume from a stale currentTime if the clip was paused
        // mid-reverse.
        v.currentTime = 0
        direction = 'forward'
        rafId = null
        void v.play().catch(() => {})
        return
      }
      v.currentTime = next
      rafId = requestAnimationFrame(reverseTick)
    }

    const startReverse = () => {
      cancelReverse()
      direction = 'reverse'
      // pause() so the browser stops trying to advance currentTime
      // forward while we drive it backward.
      v.pause()
      lastTickMs = performance.now()
      rafId = requestAnimationFrame(reverseTick)
    }

    v.addEventListener('ended', startReverse)

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (direction === 'forward') {
              void v.play().catch(() => {})
            } else if (rafId === null) {
              // Resume reverse — only re-arm rAF if it isn't already
              // running (defensive against duplicate intersection
              // events some browsers emit).
              lastTickMs = performance.now()
              rafId = requestAnimationFrame(reverseTick)
            }
          } else {
            v.pause()
            cancelReverse()
          }
        }
      },
      { threshold: 0, rootMargin: '120px' },
    )
    observer.observe(v)

    return () => {
      observer.disconnect()
      v.removeEventListener('ended', startReverse)
      cancelReverse()
    }
  }, [videoUrl])

  if (!videoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={alt} loading="lazy" className={className} />
    )
  }

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      // Same image used as the still poster. Browser shows it during
      // load and on any decode hiccup, so we don't need a separate
      // <img> background layer like the seam-fade approach used.
      poster={photoUrl}
      autoPlay
      muted
      // No `loop` attribute — we listen for `ended` and ping-pong
      // manually. Native loop would jump straight back to t=0 and
      // we'd lose the chance to play backwards.
      playsInline
      preload="metadata"
      aria-label={alt}
      className={className}
    />
  )
}
