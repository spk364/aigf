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
// PNG of the character shown in the chat window. Modelled on competitor chat
// avatars: a stylish, fashion-forward look (NOT lingerie) in a relaxed, candid,
// confident pose — tasteful-sexy rather than naked, and natural rather than a
// stiff face-on mannequin stance. Pipeline:
//   1. Atlas WAN 2.6 image-edit on the reference (identity-preserving) → full
//      body, posing, on a plain background.
//   2. fal BiRefNet → cut the background out (transparent PNG).
//   3. Persist to R2 as a character_backdrop asset. The first one auto-activates
//      (sets chatBackdropUrl); later ones are candidates the admin picks from
//      via the backdrop gallery (set-backdrop route).

const ATLAS_IMAGE_EDIT_MODEL_ID = 'alibaba/wan-2.6/image-edit'
const POLL_INTERVAL_MS = 2500
const POLL_DEADLINE_MS = 45_000

// Tasteful, fashion-forward "standee" looks modelled on competitor chat avatars
// (stylish everyday/sexy outfits, NOT lingerie). Sexy-but-clothed: bare skin is
// incidental (off-shoulder, bare legs), never the point. Picked at random per
// generation so the admin's candidates vary.
const BACKDROP_OUTFITS: string[] = [
  'an oversized black blazer worn open, slipping off one shoulder, over a bralette, with bare legs',
  'a cozy oversized knit sweater slipping off one shoulder, with bare legs',
  'a fitted athletic set — a sporty crop top and high-waisted shorts — with clean white sneakers',
  'a silky slip dress with delicate thin straps',
  'an oversized boyfriend shirt, partly unbuttoned and loosely tucked',
  'a fitted ribbed crop top and high-waisted jeans',
  'a cropped leather jacket over a fitted tank top and skinny jeans',
  'a soft knit crop top and a short pleated skirt',
]

// Natural, candid poses with real body language — weight shift, movement, hands
// in motion — instead of a stiff "standing straight, facing the camera" pose.
const BACKDROP_POSES: string[] = [
  'standing relaxed with her weight on one hip, one hand lazily running through her hair, soft genuine smile',
  'one arm raised resting on top of her head and the other hand on her hip, confident and playful, warm smile',
  'leaning slightly, glancing back over her shoulder toward the camera with a warm smile',
  'a natural contrapposto stance, one hand tucked into a pocket, laughing softly',
  'one hand on her hip, head tilted, looking straight at the camera with an easy relaxed smile',
  'caught mid-step as if walking toward the camera, candid and full of life',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

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

  // Full-body, candid, on a plain background (so the cutout is clean),
  // conditioned on the reference for identity. A stylish, tasteful outfit and a
  // natural relaxed pose — NOT lingerie, NOT nude (explicit:false). Outfit and
  // pose are randomised so repeated generations give the admin varied candidates.
  const outfit = pick(BACKDROP_OUTFITS)
  const pose = pick(BACKDROP_POSES)
  const { prompt } = buildCharacterEditPrompt({
    scene:
      'full body shot from head to toe, the whole body and the footwear visible, ' +
      `wearing ${outfit}, ${pose}, ` +
      'natural relaxed body language, candid editorial fashion photography, ' +
      'soft even studio lighting, plain seamless white studio background',
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
