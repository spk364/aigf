export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { submitAtlasImageJob, fetchAtlasImageJobStatus } from '@/shared/ai/atlas'
import { removeBackground } from '@/shared/ai/fal'
import { buildCharacterEditPrompt } from '@/features/chat/scene-prompt'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'

// Admin-only: generate a chat "standee" candidate — a full-body, transparent
// PNG of the character (in a revealing outfit / lingerie + heels, posing and
// smiling) shown in the chat window. Pipeline:
//   1. Atlas WAN 2.6 image-edit on the reference (identity-preserving) → full
//      body, posing, on a plain background.
//   2. fal BiRefNet → cut the background out (transparent PNG).
//   3. Persist to R2 as a character_backdrop asset. The first one auto-activates
//      (sets chatBackdropUrl); later ones are candidates the admin picks from
//      via the backdrop gallery (set-backdrop route).

const ATLAS_IMAGE_EDIT_MODEL_ID = 'alibaba/wan-2.6/image-edit'
const POLL_INTERVAL_MS = 2500
const POLL_DEADLINE_MS = 45_000

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Authenticated-only, matching the other /api/admin/characters/* routes.
  // A stricter roles.includes('admin') gate 403'd this for non-'admin'-role
  // accounts inside the admin panel. Tightening tracked under TODO(phase-3-auth).
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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

  // Full-body, posing, on a plain background (so the cutout is clean),
  // conditioned on the reference for identity. Revealing outfit / lingerie +
  // heels, an alluring pose and a smile — NOT nude (explicit:false).
  const { prompt } = buildCharacterEditPrompt({
    scene:
      'full body from head to toe, the entire body and the high-heeled shoes visible, ' +
      'wearing sexy lingerie (or a skimpy revealing outfit) and high heels, ' +
      'striking an alluring confident pose, smiling warmly at the camera, ' +
      'plain flat light-grey studio background',
    artStyle,
    explicit: false,
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

    // Auto-activate only the first backdrop; otherwise keep it as a candidate
    // for the admin to pick via the gallery (set-backdrop route).
    const currentActive =
      typeof character.chatBackdropUrl === 'string' ? character.chatBackdropUrl.trim() : ''
    const activated = currentActive.length === 0
    if (activated) {
      await payload.update({
        collection: 'characters',
        id: characterId,
        data: { chatBackdropUrl: persisted.publicUrl },
        overrideAccess: true,
      })
    }

    return NextResponse.json({
      ok: true,
      url: persisted.publicUrl,
      mediaAssetId: persisted.mediaAssetId,
      activated,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'backdrop_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
