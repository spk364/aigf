import 'server-only'
import { cache } from 'react'
import { getFeaturedCharacters } from '@/widgets/landing/featured-data'

export type PaywallTeaser = {
  name: string
  photoUrl: string
}

/**
 * Up to 3 published, hand-picked characters used as eye candy in the exit-
 * intent and chat paywall modals. Piggybacks on `getFeaturedCharacters()`
 * so we inherit the same moderation/published gate landing already trusts —
 * no separate "promo asset" pipeline. Cached per request so /upgrade and
 * the chat conversation page can call it without double-fetching.
 */
export const getPaywallTeasers = cache(async (): Promise<PaywallTeaser[]> => {
  try {
    const featured = await getFeaturedCharacters()
    return featured
      .filter((c) => !!c.photoUrl)
      .slice(0, 3)
      .map((c) => ({ name: c.name, photoUrl: c.photoUrl }))
  } catch {
    // Best-effort: an empty list just hides the photo strip in the modal.
    return []
  }
})
