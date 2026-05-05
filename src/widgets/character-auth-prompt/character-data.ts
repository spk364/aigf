import 'server-only'
import { getPayload } from 'payload'
import config from '@payload-config'

export type PickCharacter = {
  id: string | number
  slug: string
  name: string
  tagline: string
  archetype: string
  age: number | null
  city: string | null
  photoUrl: string
}

export async function getCharacterBySlug(
  slug: string,
  locale: string,
): Promise<PickCharacter | null> {
  let payload
  try {
    payload = await getPayload({ config })
  } catch {
    return null
  }

  let result
  try {
    result = await payload.find({
      collection: 'characters',
      locale: locale as 'en' | 'ru' | 'es',
      where: {
        and: [
          { slug: { equals: slug } },
          { kind: { equals: 'preset' } },
          { isPublished: { equals: true } },
          { primaryImageId: { exists: true } },
          { deletedAt: { exists: false } },
        ],
      },
      depth: 1,
      limit: 1,
      overrideAccess: true,
    })
  } catch {
    return null
  }

  const doc = result.docs[0]
  if (!doc) return null

  const primary = doc.primaryImageId as unknown
  if (!primary || typeof primary !== 'object') return null
  const photoUrl = (primary as { publicUrl?: unknown }).publicUrl
  if (typeof photoUrl !== 'string' || !photoUrl) return null

  const backstory = doc.backstory as Record<string, unknown> | undefined
  const age = typeof backstory?.age === 'number' ? (backstory.age as number) : null
  const city = typeof backstory?.city === 'string' ? (backstory.city as string) : null

  return {
    id: doc.id,
    slug: typeof doc.slug === 'string' ? doc.slug : String(doc.id),
    name: typeof doc.name === 'string' ? doc.name : 'Companion',
    tagline: typeof doc.tagline === 'string' ? doc.tagline : '',
    archetype:
      typeof doc.archetype === 'string' && doc.archetype
        ? doc.archetype.replaceAll('_', ' ')
        : 'Companion',
    age,
    city,
    photoUrl,
  }
}
