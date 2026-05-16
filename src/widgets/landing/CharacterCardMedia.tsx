'use client'

import { useEffect, useRef, type SyntheticEvent } from 'react'

export type CharacterCardMediaMode = 'autoplay' | 'hover'

type Props = {
  photoUrl: string
  videoUrl: string | null
  alt: string
  // Sized + positioned by the parent. Both <img> and <video> get this same
  // class so they overlap perfectly inside a `relative` parent (typically
  // `absolute inset-0 h-full w-full object-cover`).
  className: string
  /**
   * Playback behaviour:
   *  - 'autoplay': plays whenever the card is in view, ping-pongs forward/
   *    backward so there's no loop seam. Used by the LIVE ACTION rail.
   *  - 'hover' (default): starts paused, plays forward while the user hovers
   *    the closest `.group` ancestor (the card itself), pauses + rewinds on
   *    leave. Touch devices (no hover capability) fall back to autoplay-in-
   *    view so mobile users still see motion.
   */
  mode?: CharacterCardMediaMode
}

// Fade window for the seam dip in plain-loop (hover) mode — picks the photo
// up through the video for ~350 ms at the seam so the loop jump is masked.
// Boomerang playback has no seam, so this only applies to hover mode.
const SEAM_FADE_S = 0.35
const SEAM_FADE_FLOOR = 0.55

export function CharacterCardMedia({
  photoUrl,
  videoUrl,
  alt,
  className,
  mode = 'hover',
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !videoUrl) return

    // Touch devices can't hover — fall back to autoplay-in-view so the card
    // still feels alive on mobile.
    const canHover =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const effectiveMode: CharacterCardMediaMode = mode === 'hover' && !canHover ? 'autoplay' : mode

    if (effectiveMode === 'hover') {
      // Trigger is the nearest `.group` element (the card Link/wrapper).
      // Falls back to the immediate parent if no `.group` exists.
      const trigger: HTMLElement = v.closest<HTMLElement>('.group') ?? (v.parentElement as HTMLElement)
      v.pause()
      v.currentTime = 0
      const onEnter = () => {
        void v.play().catch(() => {})
      }
      const onLeave = () => {
        v.pause()
        v.currentTime = 0
      }
      trigger.addEventListener('pointerenter', onEnter)
      trigger.addEventListener('pointerleave', onLeave)
      // Keyboard focus on the card should mirror hover so keyboard users get
      // the same preview.
      trigger.addEventListener('focusin', onEnter)
      trigger.addEventListener('focusout', onLeave)
      return () => {
        trigger.removeEventListener('pointerenter', onEnter)
        trigger.removeEventListener('pointerleave', onLeave)
        trigger.removeEventListener('focusin', onEnter)
        trigger.removeEventListener('focusout', onLeave)
        v.pause()
      }
    }

    // autoplay mode (also the touch fallback): IntersectionObserver-driven
    // playback plus a ping-pong boomerang on each `ended`. Rewind is done
    // by manually stepping currentTime backwards on rAF — negative
    // playbackRate isn't supported across browsers.
    let rafId = 0
    let lastTs: number | null = null

    const stopRewind = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      lastTs = null
    }

    const rewindStep = (ts: number) => {
      // If something resumed the video (observer re-intersection, user
      // gesture, etc.) abandon the rewind and let it play forward.
      if (!v.paused) {
        stopRewind()
        return
      }
      if (lastTs == null) lastTs = ts
      const dt = (ts - lastTs) / 1000
      lastTs = ts
      const next = v.currentTime - dt
      if (next <= 0) {
        v.currentTime = 0
        stopRewind()
        void v.play().catch(() => {})
        return
      }
      v.currentTime = next
      rafId = requestAnimationFrame(rewindStep)
    }

    const onEnded = () => {
      v.pause()
      lastTs = null
      rafId = requestAnimationFrame(rewindStep)
    }
    v.addEventListener('ended', onEnded)

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // Don't fight an in-progress rewind — let it finish and resume
            // forward naturally.
            if (rafId === 0) void v.play().catch(() => {})
          } else {
            stopRewind()
            v.pause()
          }
        }
      },
      { threshold: 0, rootMargin: '120px' },
    )
    observer.observe(v)

    return () => {
      v.removeEventListener('ended', onEnded)
      stopRewind()
      observer.disconnect()
      v.pause()
    }
  }, [videoUrl, mode])

  if (!videoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={alt} loading="lazy" className={className} />
    )
  }

  // Hover-mode loop has a hard cut at the seam — dip opacity at the seam
  // so the still photo masks the jump. Boomerang has no seam, so we skip
  // the dip entirely there.
  const handleTimeUpdate =
    mode === 'autoplay'
      ? undefined
      : (e: SyntheticEvent<HTMLVideoElement>) => {
          const v = e.currentTarget
          const dur = v.duration
          if (!dur || !Number.isFinite(dur)) return
          const fadeWindow = Math.min(SEAM_FADE_S, dur / 4)
          const distance = Math.min(
            (dur - v.currentTime) / fadeWindow,
            v.currentTime / fadeWindow,
            1,
          )
          const opacity = SEAM_FADE_FLOOR + (1 - SEAM_FADE_FLOOR) * Math.max(0, distance)
          v.style.opacity = opacity.toFixed(3)
        }

  // In hover mode the video should loop natively; in autoplay we handle
  // looping manually via the boomerang rewind.
  const useNativeLoop = mode === 'hover'

  return (
    <>
      {/* Background still — always visible. Video on top covers it while
          playing. aria-hidden + empty alt because the video below carries
          the accessible label. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="" aria-hidden loading="lazy" className={className} />
      <video
        ref={videoRef}
        src={videoUrl}
        poster={photoUrl}
        muted
        playsInline
        preload="metadata"
        loop={useNativeLoop}
        aria-label={alt}
        onTimeUpdate={handleTimeUpdate}
        className={className}
      />
    </>
  )
}
