import 'server-only'
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

export type FeaturedCharacter = {
  id: string
  slug: string
  name: string
  tagline: string
  tags: string[]
  archetype: string
  age: number | null
  city: string | null
  photoUrl: string
  videoUrl: string | null
  hue: number
}

function pickHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

export const getFeaturedCharacters = cache(
  async (): Promise<FeaturedCharacter[]> => {
  let payload
  try {
    payload = await getPayload({ config })
  } catch {
    return []
  }

  let result
  try {
    result = await payload.find({
      collection: 'characters',
      where: {
        and: [
          { isPublished: { equals: true } },
          { primaryImageId: { exists: true } },
          { kind: { equals: 'preset' } },
          { deletedAt: { exists: false } },
        ],
      },
      sort: ['landingOrder', 'displayOrder'],
      limit: 24,
      depth: 1,
      overrideAccess: true,
    })
  } catch {
    return []
  }

  const characters = result.docs.filter((c) => {
    const primary = c.primaryImageId as unknown
    if (!primary || typeof primary !== 'object') return false
    const url = (primary as { publicUrl?: unknown }).publicUrl
    return typeof url === 'string' && url.length > 0
  })

  if (characters.length === 0) return []

  const characterIds = characters.map((c) => c.id)
  let videosResult
  try {
    videosResult = await payload.find({
      collection: 'media-assets',
      where: {
        and: [
          { ownerCharacterId: { in: characterIds } },
          { kind: { equals: 'generated_video' } },
          { publicUrl: { exists: true } },
          // Soft-deleted videos must drop out of the landing-page hover rotation,
          // otherwise an admin-deleted clip keeps showing on /[locale] until a
          // newer one is uploaded. Project-wide convention is the standard
          // `deletedAt: { exists: false }` filter — see soft-delete.ts.
          { deletedAt: { exists: false } },
        ],
      },
      sort: '-createdAt',
      limit: 200,
      overrideAccess: true,
    })
  } catch {
    videosResult = { docs: [] as Array<Record<string, unknown>> }
  }

  const videoByCharacter = new Map<string, string>()
  for (const v of videosResult.docs as Array<Record<string, unknown>>) {
    const owner = v.ownerCharacterId
    const ownerId =
      typeof owner === 'string' || typeof owner === 'number'
        ? String(owner)
        : owner && typeof owner === 'object' && 'id' in owner
          ? String((owner as { id: unknown }).id)
          : null
    const url = v.publicUrl
    if (!ownerId || typeof url !== 'string' || !url) continue
    if (!videoByCharacter.has(ownerId)) videoByCharacter.set(ownerId, url)
  }

  return characters.map((c) => {
    const primary = c.primaryImageId as { publicUrl: string }
    const id = String(c.id)
    const tagsRaw = c.tags as unknown
    const tags: string[] = Array.isArray(tagsRaw)
      ? tagsRaw
          .map((t) => (typeof t === 'string' ? t : (t as { tag?: string })?.tag))
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
      : typeof tagsRaw === 'string'
        ? tagsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : []

    const backstory = c.backstory as Record<string, unknown> | undefined
    const age = typeof backstory?.age === 'number' ? (backstory.age as number) : null
    const city = typeof backstory?.city === 'string' ? (backstory.city as string) : null

    return {
      id,
      slug: typeof c.slug === 'string' ? c.slug : id,
      name: typeof c.name === 'string' ? c.name : 'Companion',
      tagline: typeof c.tagline === 'string' ? c.tagline : '',
      tags,
      archetype:
        typeof c.archetype === 'string' && c.archetype
          ? c.archetype.replaceAll('_', ' ')
          : 'Companion',
      age,
      city,
      photoUrl: primary.publicUrl,
      videoUrl: videoByCharacter.get(id) ?? null,
      hue: pickHue(id),
    }
  })
  },
)
