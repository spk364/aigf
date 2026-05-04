export const maxDuration = 30

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

function relId(rel: unknown): string | number | null {
  if (rel == null) return null
  if (typeof rel === 'object' && rel !== null) {
    const obj = rel as { id?: string | number }
    return obj.id ?? null
  }
  return rel as string | number
}

export type CharacterMediaItem = {
  id: string | number
  kind: string
  publicUrl: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  createdAt: string | null
  isPrimary: boolean
  isReference: boolean
  generationMetadata: Record<string, unknown> | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: characterId } = await params
  const payload = await getPayload({ config })
  const characterIdCoerced = coerceRelId(characterId)

  let character: Record<string, unknown> | null = null
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterIdCoerced,
      overrideAccess: true,
      depth: 0,
    })) as Record<string, unknown> | null
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }
  if (!character) {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  const primaryImageId = relId(character.primaryImageId)
  const referenceImageId = relId(character.referenceImageId)

  // Resolve current primary / reference URLs in one go so the client doesn't
  // have to make a second round-trip to know if the character has a usable
  // source image.
  let primaryImageUrl: string | null = null
  let referenceImageUrl: string | null = null
  if (typeof character.referenceImageUrl === 'string' && character.referenceImageUrl.length > 0) {
    referenceImageUrl = character.referenceImageUrl
  }

  // postgres-js / Drizzle has been quirky with `in` on string enums in some
  // configurations — use explicit OR clauses so the filter is unambiguous.
  try {
    const result = await payload.find({
      collection: 'media-assets',
      where: {
        and: [
          { ownerCharacterId: { equals: characterIdCoerced } },
          {
            or: [
              { kind: { equals: 'character_reference' } },
              { kind: { equals: 'character_gallery' } },
              { kind: { equals: 'character_preview' } },
            ],
          },
          { deletedAt: { equals: null } },
        ],
      },
      sort: '-createdAt',
      limit: 200,
      overrideAccess: true,
    })

    const items: CharacterMediaItem[] = result.docs.map((d) => {
      const doc = d as Record<string, unknown>
      const id = doc.id as string | number
      const isPrimary = primaryImageId != null && String(primaryImageId) === String(id)
      const isReference = referenceImageId != null && String(referenceImageId) === String(id)
      const publicUrl = typeof doc.publicUrl === 'string' ? doc.publicUrl : null
      // Pick up resolved URLs while we already have the row.
      if (isPrimary && publicUrl) primaryImageUrl = publicUrl
      if (isReference && publicUrl && !referenceImageUrl) referenceImageUrl = publicUrl
      return {
        id,
        kind: typeof doc.kind === 'string' ? doc.kind : 'unknown',
        publicUrl,
        width: typeof doc.width === 'number' ? doc.width : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        sizeBytes: typeof doc.sizeBytes === 'number' ? doc.sizeBytes : null,
        mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
        isPrimary,
        isReference,
        generationMetadata:
          (doc.generationMetadata as Record<string, unknown> | null | undefined) ?? null,
      }
    })

    const sourceImageUrl = primaryImageUrl ?? referenceImageUrl ?? null

    return NextResponse.json({
      items,
      primaryImageId: primaryImageId != null ? String(primaryImageId) : null,
      referenceImageId: referenceImageId != null ? String(referenceImageId) : null,
      primaryImageUrl,
      referenceImageUrl,
      sourceImageUrl,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'list_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
