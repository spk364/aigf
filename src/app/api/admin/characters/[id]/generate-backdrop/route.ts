export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { submitAtlasImageJob, fetchAtlasImageJobStatus } from '@/shared/ai/atlas'
import { removeBackground } from '@/shared/ai/fal'
import { buildCharacterEditPrompt } from '@/features/chat/scene-prompt'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'

// Admin-only: generate the chat "standee" — a full-body, revealing, transparent
// PNG of the character shown in the chat window. Pipeline:
//   1. Atlas WAN 2.6 image-edit on the reference (identity-preserving) → full
//      body nude on a plain background.
//   2. fal BiRefNet → cut the background out (transparent PNG).
//   3. Persist to R2 and store the URL on the character (chatBackdropUrl).

const ATLAS_IMAGE_EDIT_MODEL_ID = 'alibaba/wan-2.6/image-edit'
const POLL_INTERVAL_MS = 2500
const POLL_DEADLINE_MS = 45_000

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const roles = (user as { roles?: string[] }).roles ?? []
  if (!roles.includes('admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const characterId = coerceRelId(id)
  const payload = await getPayload({ config })

  let character: Record<string, unknown> | null = null
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterId,
      depth: 1,
      overrideAccess: true,
    })) as Record<string, unknown> | null
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }
  if (!character) return NextResponse.json({ error: 'character_not_found' }, { status: 404 })

  // Identity anchor: denormalized reference URL, else the primary image.
  let referenceImageUrl: string | null = null
  if (typeof character.referenceImageUrl === 'string' && character.referenceImageUrl.trim()) {
    referenceImageUrl = character.referenceImageUrl.trim()
  } else {
    const primary = character.primaryImageId as unknown
    const url =
      primary && typeof primary === 'object' ? (primary as { publicUrl?: unknown }).publicUrl : null
    if (typeof url === 'string' && url.trim()) referenceImageUrl = url.trim()
  }
  if (!referenceImageUrl) {
    return NextResponse.json(
      { error: 'no_reference', message: 'Set a reference or primary image for this character first.' },
      { status: 400 },
    )
  }

  const artStyle =
    character.artStyle === 'anime' || character.artStyle === 'realistic'
      ? (character.artStyle as 'anime' | 'realistic')
      : undefined

  // Full-body nude on a plain background (so the cutout is clean), conditioned
  // on the reference for identity. Reuses the chat edit-prompt builder.
  const { prompt } = buildCharacterEditPrompt({
    scene:
      'standing upright, full body from head to toe, the entire body visible, facing the camera, ' +
      'plain flat light-grey studio background, completely nude, fully naked, no clothing',
    artStyle,
    explicit: true,
  })

  try {
    const handles = await submitAtlasImageJob({
      prompt,
      imageSize: { width: 768, height: 1344 },
      numImages: 1,
      endpoint: ATLAS_IMAGE_EDIT_MODEL_ID,
      ipAdapterImageUrl: referenceImageUrl,
    })

    const startedAt = Date.now()
    let generatedUrl: string | null = null
    while (Date.now() - startedAt < POLL_DEADLINE_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const status = await fetchAtlasImageJobStatus({
        statusUrl: handles.statusUrl,
        responseUrl: handles.responseUrl,
        requestId: handles.requestId,
        endpoint: handles.endpoint,
        modelName: handles.modelName,
        startedAtMs: startedAt,
      })
      if (status.status === 'completed') {
        generatedUrl = status.result.images[0]?.url ?? null
        break
      }
      if (status.status === 'failed') {
        return NextResponse.json({ error: 'generation_failed', message: status.error }, { status: 502 })
      }
    }
    if (!generatedUrl) {
      return NextResponse.json({ error: 'generation_timeout' }, { status: 504 })
    }

    // Cut the background out → transparent PNG.
    const cutout = await removeBackground(generatedUrl)

    const persisted = await persistGeneratedImage({
      payload,
      fromUrl: cutout.url,
      width: cutout.width,
      height: cutout.height,
      contentType: cutout.contentType,
      kind: 'character-backdrop',
      ownerCharacterId: characterId,
      generationMetadata: { source: 'chat-backdrop', model: ATLAS_IMAGE_EDIT_MODEL_ID },
    })

    await payload.update({
      collection: 'characters',
      id: characterId,
      data: { chatBackdropUrl: persisted.publicUrl },
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, url: persisted.publicUrl })
  } catch (err) {
    return NextResponse.json(
      { error: 'backdrop_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
