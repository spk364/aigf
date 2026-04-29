// Authenticated catalog API — see spec §3.2.2.
// Returns preset characters in user's locale with optional filters/search.
// Free-tier users see NSFW cards with blurred=true and no primaryImageUrl
// (tease for conversion per spec §3.1).
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

const SUPPORTED_LOCALES = ['en', 'ru', 'es'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

const ART_STYLES = ['realistic', 'anime', '3d_render', 'stylized'] as const
const CONTENT_RATINGS = ['sfw', 'nsfw_soft', 'nsfw_explicit'] as const

const MAX_LIMIT = 48
const DEFAULT_LIMIT = 24

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function isArtStyle(value: string): value is (typeof ART_STYLES)[number] {
  return (ART_STYLES as readonly string[]).includes(value)
}

function isContentRating(value: string): value is (typeof CONTENT_RATINGS)[number] {
  return (CONTENT_RATINGS as readonly string[]).includes(value)
}

function parseMulti(raw: string | null, predicate: (v: string) => boolean): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && predicate(s))
}

type CatalogCard = {
  id: string | number
  name: string
  tagline: string | null
  shortBio: string | null
  tags: string[]
  artStyle: string | null
  archetype: string | null
  contentRating: string | null
  primaryImageUrl: string | null
  blurred: boolean
}

async function getUserPlan(
  payload: Awaited<ReturnType<typeof getPayload>>,
  userId: string | number,
): Promise<'free' | 'premium' | 'premium_plus'> {
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: userId } },
    limit: 1,
    overrideAccess: true,
  })
  const sub = subResult.docs[0]
  if (!sub || sub.status !== 'active') return 'free'
  if (sub.plan === 'premium_plus_monthly') return 'premium_plus'
  if (sub.plan === 'premium_monthly' || sub.plan === 'premium_yearly') return 'premium'
  return 'free'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const params = request.nextUrl.searchParams

  const localeParam = params.get('locale')
  const locale: Locale = isLocale(localeParam) ? localeParam : 'en'

  const search = (params.get('q') ?? '').trim().slice(0, 80)
  const artStyles = parseMulti(params.get('artStyle'), isArtStyle)
  const archetypes = parseMulti(params.get('archetype'), () => true)
  const ratingsParam = parseMulti(params.get('contentRating'), isContentRating)
  const tags = parseMulti(params.get('tags'), () => true).slice(0, 10)

  const limit = (() => {
    const n = Number(params.get('limit'))
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.floor(n))
  })()
  const page = (() => {
    const n = Number(params.get('page'))
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  })()

  const plan = await getUserPlan(payload, user.id)

  const conditions: Where[] = [
    { kind: { equals: 'preset' } },
    { isPublished: { equals: true } },
    { deletedAt: { equals: null } },
  ]

  if (artStyles.length > 0) {
    conditions.push({ artStyle: { in: artStyles } })
  }
  if (archetypes.length > 0) {
    conditions.push({ archetype: { in: archetypes } })
  }
  if (ratingsParam.length > 0) {
    conditions.push({ contentRating: { in: ratingsParam } })
  }
  if (tags.length > 0) {
    // Payload `in` on hasMany text matches when ANY tag matches.
    conditions.push({ tags: { in: tags } })
  }
  if (search.length > 0) {
    conditions.push({
      or: [{ name: { like: search } }, { shortBio: { like: search } }],
    })
  }

  const result = await payload.find({
    collection: 'characters',
    locale,
    where: { and: conditions },
    sort: ['-featured', 'displayOrder', 'name'],
    page,
    limit,
    depth: 1,
    overrideAccess: true,
  })

  const cards: CatalogCard[] = result.docs.map((doc) => {
    const isNsfw = doc.contentRating === 'nsfw_soft' || doc.contentRating === 'nsfw_explicit'
    const blurred = isNsfw && plan === 'free'

    const primaryImage = doc.primaryImageId
    const rawUrl =
      primaryImage && typeof primaryImage === 'object' && 'publicUrl' in primaryImage
        ? ((primaryImage as { publicUrl?: string | null }).publicUrl ?? null)
        : null

    return {
      id: doc.id,
      name: doc.name,
      tagline: doc.tagline ?? null,
      shortBio: doc.shortBio ?? null,
      tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
      artStyle: doc.artStyle ?? null,
      archetype: doc.archetype ?? null,
      contentRating: doc.contentRating ?? null,
      primaryImageUrl: blurred ? null : rawUrl,
      blurred,
    }
  })

  return NextResponse.json({
    locale,
    plan,
    cards,
    pagination: {
      page: result.page ?? 1,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
      limit,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  })
}
