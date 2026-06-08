// Minimal, conservative service worker — its job is to make the app
// installable (Chrome requires a SW with a fetch handler) and to show a
// friendly offline page for navigations. It deliberately does NOT cache JS/CSS
// chunks: Next.js ships content-hashed assets and an over-eager cache here is
// the classic source of "stale app after deploy" bugs. Everything except
// top-level navigations passes straight through to the network.

const CACHE = 'gfai-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any older shell caches from previous versions.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle navigations (page loads). Network-first; fall back to the
  // cached offline page when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(OFFLINE_URL)
        return cached ?? Response.error()
      }),
    )
  }
  // All other requests: no respondWith → default browser handling.
})
