import 'server-only'
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Where } from 'payload'

export type FeaturedCharacter = {
  id: string
  slug: string
  name: string
  tagline: string
  tags: string[]
  archetype: string
  archetypeRaw: string
  artStyle: string | null
  age: number | null
  city: string | null
  photoUrl: string
  videoUrl: string | null
  greetingAudioUrl: string | null
  hue: number
  messageCount: number
  conversationCount: number
  publishedAt: string | null
}

export type ExploreSort = 'featured' | 'popular' | 'new' | 'random'

export type ExploreFilters = {
  search?: string
  archetype?: string | null
  artStyle?: string | null
  tags?: string[]
  sort?: ExploreSort
  ageMin?: number | null
  ageMax?: number | null
  limit?: number
  locale?: string
}

function pickHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

type RawCharacter = Record<string, unknown> & {
  id: string | number
  primaryImageId?: unknown
  greetingAudioAssetId?: unknown
  tags?: unknown
  backstory?: unknown
  archetype?: unknown
  slug?: unknown
  name?: unknown
  tagline?: unknown
  artStyle?: unknown
  conversationCount?: unknown
  messageCount?: unknown
  publishedAt?: unknown
}

function readTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => (typeof t === 'string' ? t : (t as { tag?: string })?.tag))
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function readNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

async function loadCharactersWithVideos(
  where: Where,
  sort: string | string[],
  limit: number,
  locale?: string,
): Promise<FeaturedCharacter[]> {
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
      where,
      sort,
      limit,
      depth: 1,
      overrideAccess: true,
      ...(locale ? { locale: locale as never } : {}),
    })
  } catch {
    return []
  }

  const characters = (result.docs as unknown as RawCharacter[]).filter((c) => {
    const primary = c.primaryImageId
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
          { deletedAt: { exists: false } },
        ],
      },
      sort: '-createdAt',
      limit: 500,
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
    const tags = readTags(c.tags)
    const backstory = c.backstory as Record<string, unknown> | undefined
    const age = typeof backstory?.age === 'number' ? (backstory.age as number) : null
    const city = typeof backstory?.city === 'string' ? (backstory.city as string) : null
    const archetypeRaw =
      typeof c.archetype === 'string' && c.archetype ? c.archetype : ''
    const greetingRel = c.greetingAudioAssetId
    const greetingAudioUrl =
      greetingRel && typeof greetingRel === 'object' && 'publicUrl' in greetingRel
        ? ((greetingRel as { publicUrl?: unknown }).publicUrl as string | null) ?? null
        : null

    return {
      id,
      slug: typeof c.slug === 'string' ? c.slug : id,
      name: typeof c.name === 'string' ? c.name : 'Companion',
      tagline: typeof c.tagline === 'string' ? c.tagline : '',
      tags,
      archetype: archetypeRaw ? archetypeRaw.replaceAll('_', ' ') : 'Companion',
      archetypeRaw,
      artStyle: typeof c.artStyle === 'string' && c.artStyle ? c.artStyle : null,
      age,
      city,
      photoUrl: primary.publicUrl,
      videoUrl: videoByCharacter.get(id) ?? null,
      greetingAudioUrl,
      hue: pickHue(id),
      messageCount: readNumber(c.messageCount),
      conversationCount: readNumber(c.conversationCount),
      publishedAt: typeof c.publishedAt === 'string' ? c.publishedAt : null,
    }
  })
}

const baseWhere: Where = {
  and: [
    { isPublished: { equals: true } },
    { primaryImageId: { exists: true } },
    { kind: { equals: 'preset' } },
    { deletedAt: { exists: false } },
  ],
}

export const getFeaturedCharacters = cache(
  async (): Promise<FeaturedCharacter[]> =>
    loadCharactersWithVideos(baseWhere, ['landingOrder', 'displayOrder'], 24),
)

export async function getExploreCharacters(
  filters: ExploreFilters = {},
): Promise<FeaturedCharacter[]> {
  const {
    search = '',
    archetype = null,
    artStyle = null,
    tags = [],
    sort = 'featured',
    ageMin = null,
    ageMax = null,
    limit = 100,
    locale,
  } = filters

  const conditions: Where[] = [
    { isPublished: { equals: true } },
    { primaryImageId: { exists: true } },
    { kind: { equals: 'preset' } },
    { deletedAt: { exists: false } },
  ]

  if (archetype) conditions.push({ archetype: { equals: archetype } })
  if (artStyle) conditions.push({ artStyle: { equals: artStyle } })
  if (tags.length > 0) conditions.push({ tags: { in: tags } })

  const trimmedSearch = search.trim()
  if (trimmedSearch.length > 0) {
    conditions.push({
      or: [
        { name: { like: trimmedSearch } },
        { tagline: { like: trimmedSearch } },
        { tags: { like: trimmedSearch } },
        { archetype: { like: trimmedSearch } },
      ],
    })
  }

  const sortClause: string | string[] =
    sort === 'popular'
      ? ['-messageCount', '-conversationCount', 'displayOrder']
      : sort === 'new'
        ? ['-publishedAt', '-createdAt']
        : sort === 'random'
          ? ['displayOrder']
          : ['landingOrder', 'displayOrder']

  // Random sort isn't natively supported by Payload; we fetch a wider set and
  // shuffle in JS. For other sorts the DB ordering is authoritative.
  const fetchLimit = sort === 'random' ? Math.max(limit, 200) : limit
  let docs = await loadCharactersWithVideos(
    { and: conditions },
    sortClause,
    fetchLimit,
    locale,
  )

  if (ageMin != null || ageMax != null) {
    docs = docs.filter((c) => {
      if (c.age == null) return false
      if (ageMin != null && c.age < ageMin) return false
      if (ageMax != null && c.age > ageMax) return false
      return true
    })
  }

  if (sort === 'random') {
    for (let i = docs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[docs[i], docs[j]] = [docs[j]!, docs[i]!]
    }
    docs = docs.slice(0, limit)
  }

  return docs
}

export type ArchetypeBucket = {
  value: string
  count: number
}

export const getArchetypeBuckets = cache(async (): Promise<ArchetypeBucket[]> => {
  const docs = await loadCharactersWithVideos(baseWhere, ['displayOrder'], 500)
  const counts = new Map<string, number>()
  for (const d of docs) {
    const key = d.archetypeRaw || ''
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
})

export type TagBucket = {
  value: string
  count: number
}

export const getTopTags = cache(async (max = 16): Promise<TagBucket[]> => {
  const docs = await loadCharactersWithVideos(baseWhere, ['displayOrder'], 500)
  const counts = new Map<string, number>()
  for (const d of docs) {
    for (const t of d.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, max)
})

export const getArtStyleBuckets = cache(async (): Promise<ArchetypeBucket[]> => {
  const docs = await loadCharactersWithVideos(baseWhere, ['displayOrder'], 500)
  const counts = new Map<string, number>()
  for (const d of docs) {
    if (!d.artStyle) continue
    counts.set(d.artStyle, (counts.get(d.artStyle) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
})
