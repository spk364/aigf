'use client'

import { useEffect, useRef, useState } from 'react'

// Auto-plays a <video> when it scrolls into the viewport and pauses it
// when it scrolls out — the polite version of slapping `autoplay` on
// every card. Landing renders 20+ character cards; naive autoplay would
// have the browser download and decode every clip simultaneously, which
// is hostile to mobile data plans and lower-end devices.
//
// Returned `hasFirstFrame` flips to true on the first `playing` event,
// letting the parent fade the still photo out only after we have an
// actual video frame to swap in (avoids a black flash while the clip
// buffers).
export function useAutoplayInView(): {
  ref: React.MutableRefObject<HTMLVideoElement | null>
  hasFirstFrame: boolean
} {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [hasFirstFrame, setHasFirstFrame] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v) return

    const onPlaying = () => setHasFirstFrame(true)
    v.addEventListener('playing', onPlaying)

    // rootMargin pre-warms one card-height beyond the viewport so the
    // user rarely lands on a still poster while scrolling. threshold
    // 0.2 is enough that a partially-scrolled card still triggers.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void v.play().catch(() => {
              // Browsers reject muted-autoplay only in narrow cases
              // (battery saver, prefers-reduced-motion, low-power mode).
              // Swallow — the still photo stays as the fallback frame.
            })
          } else {
            v.pause()
          }
        }
      },
      { threshold: 0.2, rootMargin: '120px' },
    )
    observer.observe(v)

    return () => {
      observer.disconnect()
      v.removeEventListener('playing', onPlaying)
    }
  }, [])

  return { ref, hasFirstFrame }
}
