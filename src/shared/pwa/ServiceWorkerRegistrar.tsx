'use client'

import { useEffect } from 'react'

// Registers the service worker (public/sw.js) so the app is installable and can
// show an offline page. Production-only: a SW in dev fights Next's HMR and can
// serve stale chunks. Renders nothing.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failures are non-fatal — the app still works online.
      })
    }

    // Defer until after load so SW install doesn't compete with first paint.
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
