import 'server-only'
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

export type BannerPage = 'home' | 'girls' | 'anime' | 'boys'

export type ActiveBanner = {
  id: string
  internalName: string
  imageUrl: string | null
  eyebrow: string
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  hueA: number
  hueB: number
  displayOrder: number
}

type RawBanner = Record<string, unknown> & {
  id: string | number
  internalName?: unknown
  pages?: unknown
  image?: unknown
  imageUrl?: unknown
  eyebrow?: unknown
  title?: unknown
  subtitle?: unknown
  ctaLabel?: unknown
  ctaHref?: unknown
  hueA?: unknown
  hueB?: unknown
  displayOrder?: unknown
}

function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function readNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function readPages(v: unknown): BannerPage[] {
  if (!Array.isArray(v)) return []
  return v.filter((p): p is BannerPage =>
    p === 'home' || p === 'girls' || p === 'anime' || p === 'boys',
  )
}

function resolveImageUrl(raw: RawBanner): string | null {
  const direct = readString(raw.imageUrl)
  if (direct) return direct
  const rel = raw.image
  if (rel && typeof rel === 'object' && 'publicUrl' in rel) {
    const url = (rel as { publicUrl?: unknown }).publicUrl
    return typeof url === 'string' && url.length > 0 ? url : null
  }
  return null
}

export const getActiveBannersForPage = cache(
  async (page: BannerPage, locale?: string): Promise<ActiveBanner[]> => {
    let payload
    try {
      payload = await getPayload({ config })
    } catch {
      return []
    }

    const now = new Date().toISOString()
    let result
    try {
      result = await payload.find({
        collection: 'banners',
        where: {
          and: [
            { isActive: { equals: true } },
            { deletedAt: { exists: false } },
            { pages: { contains: page } },
            {
              or: [
                { startsAt: { exists: false } },
                { startsAt: { less_than_equal: now } },
              ],
            },
            {
              or: [
                { endsAt: { exists: false } },
                { endsAt: { greater_than_equal: now } },
              ],
            },
          ],
        },
        sort: 'displayOrder',
        limit: 12,
        depth: 1,
        overrideAccess: true,
        ...(locale ? { locale: locale as never } : {}),
      })
    } catch {
      return []
    }

    return (result.docs as unknown as RawBanner[])
      .filter((b) => readPages(b.pages).includes(page))
      .map((b) => ({
        id: String(b.id),
        internalName: readString(b.internalName, 'banner'),
        imageUrl: resolveImageUrl(b),
        eyebrow: readString(b.eyebrow),
        title: readString(b.title),
        subtitle: readString(b.subtitle),
        ctaLabel: readString(b.ctaLabel),
        ctaHref: readString(b.ctaHref),
        hueA: readNumber(b.hueA, 320),
        hueB: readNumber(b.hueB, 280),
        displayOrder: readNumber(b.displayOrder, 0),
      }))
  },
)
