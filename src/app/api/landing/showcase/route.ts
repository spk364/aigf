// Public landing showcase — no auth, SFW-only, see spec §3.2.1.
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

const SUPPORTED_LOCALES = ['en', 'ru', 'es'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

const MAX_CARDS = 12

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

type ShowcaseCard = {
  id: string | number
  name: string
  tagline: string | null
  shortBio: string | null
  tags: string[]
  artStyle: string | null
  primaryImageUrl: string | null
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const localeParam = request.nextUrl.searchParams.get('locale')
  const locale: Locale = isLocale(localeParam) ? localeParam : 'en'

  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'characters',
    locale,
    where: {
      and: [
        { kind: { equals: 'preset' } },
        { isPublished: { equals: true } },
        { landingFeatured: { equals: true } },
        { contentRating: { equals: 'sfw' } },
        { deletedAt: { equals: null } },
      ],
    },
    sort: ['landingOrder', 'displayOrder'],
    limit: MAX_CARDS,
    depth: 1,
    overrideAccess: true,
  })

  const cards: ShowcaseCard[] = result.docs.map((doc) => {
    const primaryImage = doc.primaryImageId
    const primaryImageUrl =
      primaryImage && typeof primaryImage === 'object' && 'publicUrl' in primaryImage
        ? ((primaryImage as { publicUrl?: string | null }).publicUrl ?? null)
        : null

    return {
      id: doc.id,
      name: doc.name,
      tagline: doc.tagline ?? null,
      shortBio: doc.shortBio ?? null,
      tags: Array.isArray(doc.tags) ? (doc.tags as string[]).slice(0, 3) : [],
      artStyle: doc.artStyle ?? null,
      primaryImageUrl,
    }
  })

  return NextResponse.json(
    { locale, cards },
    {
      headers: {
        // Edge cache 5 min, stale-while-revalidate 10 min — preset data rarely changes.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}
