import type { MetadataRoute } from 'next'

// Web app manifest — served at /manifest.webmanifest. Makes the app installable
// (Add to Home Screen) on Android/Chrome and iOS Safari. The middleware matcher
// excludes dotted paths, so this is reachable without an i18n locale prefix.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'girlfriend.ai — AI Companion',
    short_name: 'girlfriend.ai',
    description: 'Chat with your AI companion — anytime, anywhere.',
    // '/' resolves through the i18n middleware to the default locale.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0a10',
    theme_color: '#0b0a10',
    categories: ['entertainment', 'social', 'lifestyle'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
