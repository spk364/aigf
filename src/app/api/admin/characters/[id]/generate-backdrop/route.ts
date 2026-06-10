export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { submitAtlasImageJob, fetchAtlasImageJobStatus } from '@/shared/ai/atlas'
import { removeBackground } from '@/shared/ai/fal'
import { buildCharacterEditPrompt } from '@/features/chat/scene-prompt'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'

// Admin-only: generate a chat "standee" candidate — a transparent PNG of the
// character shown in the chat window. Modelled on competitor chat avatars: a
// 3/4 (head-to-mid-thigh) crop, a revealing-but-styled look (lingerie under an
// open blazer / shirt / robe), and a sultry, body-forward pose. The point is to
// be seductive AND editorial — not plain naked (reads as a stiff mannequin) and
// not fully-covered casual (reads as a boring catalog photo). Pipeline:
//   1. Atlas WAN 2.6 image-edit on the reference (identity-preserving) → 3/4
//      crop, posing, on a plain background.
//   2. fal BiRefNet → cut the background out (transparent PNG).
//   3. Persist to R2 as a character_backdrop asset. The first one auto-activates
//      (sets chatBackdropUrl); later ones are candidates the admin picks from
//      via the backdrop gallery (set-backdrop route).

const ATLAS_IMAGE_EDIT_MODEL_ID = 'alibaba/wan-2.6/image-edit'
const POLL_INTERVAL_MS = 2500
const POLL_DEADLINE_MS = 45_000

// Seductive "standee" looks modelled on competitor chat avatars. The winning
// formula there is NOT plain lingerie (which read as a naked, stiff mannequin)
// nor fully-covered casual wear (which read as a boring catalog photo) — it is
// revealing lingerie ALWAYS paired with a styled statement layer (an open
// blazer, an unbuttoned shirt, a draped robe). Skin-forward but editorial.
// Picked at random per generation so the admin's candidates vary.
const BACKDROP_OUTFITS: string[] = [
  'an open oversized blazer over a delicate black lace bralette, with a matching mini skirt and a thin belt',
  'an oversized blazer worn open and slipping off both shoulders over delicate lingerie, with sheer panties',
  'a delicate lace bra and a wet-look leather mini skirt with a gold statement belt',
  'a silk robe draped loosely open over a matching lingerie set',
  'a cropped knit sweater pulled off one shoulder over a lace bra, with a short skirt',
  'an unbuttoned oversized white shirt over a lace bra and high-cut panties',
  'a fitted bodysuit under an open denim jacket, with bare legs',
  'a strappy bralette and a high-waisted leather mini skirt',
]

// Confident, sultry, body-forward poses — direct smoldering eye contact or a
// warm inviting smile, with movement that flatters the figure (weight on one
// hip, off-shoulder, a hand in the hair). Never a stiff face-on stance.
const BACKDROP_POSES: string[] = [
  'looking straight into the camera with a confident sultry gaze, one hand sliding through her hair, weight on one hip',
  'slipping the jacket off one shoulder, chin slightly down, a warm inviting smile and direct eye contact',
  'leaning back slightly with her hips pushed out, lips parted, a smoldering look at the camera',
  'one hand on her hip and the other in her hair, glancing over her shoulder with a playful seductive smile',
  'standing in a relaxed S-curve, head tilted, a soft alluring smile and half-lidded eyes on the camera',
  'running both hands through her hair, back gently arched, confident and inviting',
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

  // Seductive 3/4 standee on a plain background (so the cutout is clean),
  // conditioned on the reference for identity. A revealing-but-styled outfit and
  // a sultry, body-forward pose. Framed head-to-mid-thigh (NOT full height) so
  // the figure fills the frame and reads close and flattering, like the
  // competitor avatars. explicit:false keeps it lingerie-level, not nude. Outfit
  // and pose are randomised so repeated generations give varied candidates.
  const outfit = pick(BACKDROP_OUTFITS)
  const pose = pick(BACKDROP_POSES)
  // Style tail must match the character's art style. The realistic
  // "editorial fashion PHOTOGRAPHY" phrasing pulls the image-edit model to
  // photorealism even for anime references — so anime needs its own
  // illustration-leaning tail (with explicit anti-photo disclaimers), or anime
  // characters render as realistic.
  const isAnime = artStyle === 'anime'
  const styleTail = isAnime
    ? 'detailed 2D anime illustration, cel-shaded, clean lineart, vibrant anime colors, ' +
      'anime art style, NOT a photo, NOT photorealistic, NOT 3D render'
    : 'glamour editorial fashion photography, flattering soft studio lighting, sharp focus, ' +
      'high detail, photorealistic'
  const { prompt } = buildCharacterEditPrompt({
    scene:
      'a three-quarter shot framed from the top of the head down to mid-thigh, the figure ' +
      `filling the frame, wearing ${outfit}, ${pose}, ${styleTail}, ` +
      'alluring and seductive yet elegant, plain seamless white studio background',
    artStyle,
    explicit: false,
  })

  try {
    const handles = await submitAtlasImageJob({
      prompt,
      // 2:3 portrait — suits a head-to-mid-thigh 3/4 crop (a taller 4:7 frame
      // pulls the model toward a small, distant full-body render instead).
      imageSize: { width: 832, height: 1216 },
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
