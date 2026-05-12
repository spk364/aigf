'use client'

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

// Returns a ref to attach to a <video>; pauses the clip when it scrolls
// out of view and resumes when it comes back. The actual first-time
// playback is triggered by the `autoPlay` attribute on the <video> —
// browsers honour muted autoplay reliably and start playback the moment
// they have enough data, with no programmatic gesture needed.
//
// The observer is just a perf trim so 20+ clips on /explore don't keep
// decoding while offscreen. rootMargin pre-warms one card-height beyond
// the viewport so a fast scroll doesn't catch a paused clip.
export function useAutoplayInView(): MutableRefObject<HTMLVideoElement | null> {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void v.play().catch(() => {})
          } else {
            v.pause()
          }
        }
      },
      { threshold: 0, rootMargin: '120px' },
    )
    observer.observe(v)
    return () => observer.disconnect()
  }, [])

  return ref
}
