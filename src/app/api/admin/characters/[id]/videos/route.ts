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

type VideoAsset = {
  id: string | number
  publicUrl?: string | null
  width?: number | null
  height?: number | null
  durationSec?: number | null
  sizeBytes?: number | null
  mimeType?: string | null
  createdAt?: string
  generationMetadata?: Record<string, unknown> | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: characterId } = await params
  const payload = await getPayload({ config })

  try {
    const result = await payload.find({
      collection: 'media-assets',
      where: {
        and: [
          { ownerCharacterId: { equals: coerceRelId(characterId) } },
          { kind: { equals: 'generated_video' } },
          { deletedAt: { equals: null } },
        ],
      },
      sort: '-createdAt',
      limit: 50,
      overrideAccess: true,
    })

    const videos: VideoAsset[] = result.docs.map((d) => {
      const doc = d as Record<string, unknown>
      return {
        id: doc.id as string | number,
        publicUrl: (doc.publicUrl as string | null | undefined) ?? null,
        width: (doc.width as number | null | undefined) ?? null,
        height: (doc.height as number | null | undefined) ?? null,
        durationSec: (doc.durationSec as number | null | undefined) ?? null,
        sizeBytes: (doc.sizeBytes as number | null | undefined) ?? null,
        mimeType: (doc.mimeType as string | null | undefined) ?? null,
        createdAt: doc.createdAt as string | undefined,
        generationMetadata:
          (doc.generationMetadata as Record<string, unknown> | null | undefined) ?? null,
      }
    })

    return NextResponse.json({ videos })
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
