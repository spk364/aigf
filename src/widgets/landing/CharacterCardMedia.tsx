'use client'

import type { SyntheticEvent } from 'react'
import { useAutoplayInView } from './use-autoplay-in-view'

type Props = {
  photoUrl: string
  videoUrl: string | null
  alt: string
  // Sized + positioned by the parent. Both <img> and <video> get this same
  // class so they overlap perfectly inside a `relative` parent (typically
  // `absolute inset-0 h-full w-full object-cover`).
  className: string
}

// Soft-loops the character preview clip. Strategy:
//   1. The still photo sits behind as a fixed background layer.
//   2. The <video> autoplays on top, muted, looped.
//   3. A timeupdate handler dips the video's opacity for the last ~350 ms
//      of each iteration and ramps it back over the first ~350 ms of the
//      next, so the photo bleeds through right at the seam.
// The user perceives a gentle pulse instead of a hard jump-cut between
// the last and first video frames — the seam lines up with the still
// photo, so the dip looks intentional even when the loop point is
// visually mismatched.
//
// Falls back to a plain <img> when the character has no generated video.
export function CharacterCardMedia({ photoUrl, videoUrl, alt, className }: Props) {
  const videoRef = useAutoplayInView()

  if (!videoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={alt} loading="lazy" className={className} />
    )
  }

  // Width of the fade-in/out window in seconds. Capped to a quarter of
  // the clip duration in handleTimeUpdate so very short loops don't end
  // up in a permanent dip.
  const FADE_S = 0.35
  const OPACITY_FLOOR = 0.5

  const handleTimeUpdate = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget
    const dur = v.duration
    if (!dur || !Number.isFinite(dur)) return
    const fadeWindow = Math.min(FADE_S, dur / 4)
    const remaining = dur - v.currentTime
    // 1.0 in the middle of the clip, 0.0 at the exact loop seam.
    const distance = Math.min(remaining / fadeWindow, v.currentTime / fadeWindow, 1)
    const opacity = OPACITY_FLOOR + (1 - OPACITY_FLOOR) * Math.max(0, distance)
    // Direct style write avoids a render per timeupdate (~4 hz). The
    // browser's compositor handles opacity changes off the main thread.
    v.style.opacity = opacity.toFixed(3)
  }

  return (
    <>
      {/* Background still — always visible. The video on top covers it
          while playing; the seam-fade lets it peek through to mask the
          loop jump-cut. aria-hidden + empty alt because the video below
          carries the accessible label. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        loading="lazy"
        className={className}
      />
      <video
        ref={videoRef}
        src={videoUrl}
        poster={photoUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        onTimeUpdate={handleTimeUpdate}
        className={className}
      />
    </>
  )
}
