export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { generateImage, FAL_ENDPOINT_REALISTIC_VISION, FAL_ENDPOINT_FAST_SDXL } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { getCurrentUser } from '@/shared/auth/current-user'
import { IMAGE_MODEL_OPTIONS } from '@/shared/ai/image-models'
import { saveGeneratedImageToDisk } from '@/shared/debug/save-generated-image'

const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const REFERENCE_NEGATIVE_EXTRA =
  ', dramatic lighting, heavy shadows, dark background, complex background, ' +
  'extreme pose, artistic filter, cosplay, costume, swimwear, lingerie, ' +
  'multiple people, text, watermark, blurry, out of focus'

const bodySchema = z.object({
  modelOverride: z.string().optional(),
  // When true, the freshly persisted reference asset is also written to
  // `characters.primaryImageId` so it shows on the catalog / video flow.
  setPrimary: z.boolean().default(false),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    )
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 })
  }

  const { id: characterId } = await params
  const payload = await getPayload({ config })

  let character: Record<string, unknown>
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterId,
      overrideAccess: true,
    })) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  if (!character || character.deletedAt) {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  const appearance = character.appearance as {
    appearancePrompt?: string
    subjectTokens?: string
    negativePrompt?: string
    safetyAdultMarkers?: string[]
  } | null

  const artStyle = character.artStyle as string | null
  const isAnime = artStyle === 'anime'

  // For reference images, always use stable, non-stylized checkpoints.
  // modelOverride is accepted but only if it's NOT a Pony/Illustrious checkpoint.
  const VALID_MODEL_IDS = IMAGE_MODEL_OPTIONS.map((m) => m.id)
  const requestedModel = body.modelOverride && VALID_MODEL_IDS.includes(body.modelOverride)
    ? body.modelOverride
    : null
  const requestedMeta = requestedModel
    ? IMAGE_MODEL_OPTIONS.find((m) => m.id === requestedModel)
    : null
  const isPonyOverride = requestedMeta?.isPony ?? false

  // If the override is a Pony/Illustrious checkpoint, ignore it — too stylized for reference.
  const endpoint = isPonyOverride || !requestedModel
    ? (isAnime ? FAL_ENDPOINT_FAST_SDXL : FAL_ENDPOINT_REALISTIC_VISION)
    : requestedModel

  const safetyMarkers = appearance?.safetyAdultMarkers?.join(', ') ?? 'adult woman, (18+ years old:1.3)'
  const subjectTokens = appearance?.subjectTokens ?? 'beautiful young woman'

  const prompt = isAnime
    ? [
        'anime style, masterpiece, best quality, character reference sheet',
        subjectTokens,
        'neutral expression, slight smile, looking at viewer',
        'simple casual outfit, plain white background, soft even lighting',
        'clean lines',
        safetyMarkers,
      ].filter(Boolean).join(', ')
    : [
        'RAW photo, studio portrait',
        subjectTokens,
        'neutral expression, slight smile, looking directly at camera',
        'casual clothing, simple outfit, studio gray background',
        'soft even lighting, no shadows, professional portrait photography',
        safetyMarkers,
        '8k uhd, sharp focus, high detail',
      ].filter(Boolean).join(', ')

  const baseNegative = appearance?.negativePrompt
    ? appearance.negativePrompt
    : isAnime
      ? 'worst quality, low quality, normal quality, lowres, watermark, signature, blurry, deformed'
      : '(deformed iris, deformed pupils), text, cropped, worst quality, low quality, blurry, bad anatomy, watermark'

  const negativePrompt = `${baseNegative}, ${SAFETY_NEGATIVE}${REFERENCE_NEGATIVE_EXTRA}`

  try {
    // 832×1216 — SDXL-native portrait bucket. Comfortably clears the video
    // source threshold (768×1024) and gives WAN 2.2 i2v a tall frame to work with.
    // 25 steps at guidance 7 keeps RealVis under ~30s on Vercel's 60s ceiling;
    // for a clean studio reference the extra 15 steps from the old default
    // produced no visible improvement.
    const result = await generateImage({
      prompt,
      negativePrompt,
      imageSize: { width: 832, height: 1216 },
      numImages: 1,
      numInferenceSteps: 25,
      guidanceScale: 7,
      endpoint,
    })

    const img = result.images[0]!

    const savedPath = await saveGeneratedImageToDisk({
      imageUrl: img.url,
      model: result.modelName,
      width: img.width,
      height: img.height,
      kind: 'reference',
    })

    const persisted = await persistGeneratedImage({
      payload,
      fromUrl: img.url,
      width: img.width,
      height: img.height,
      contentType: img.contentType,
      kind: 'character-reference',
      ownerCharacterId: characterId,
      generationMetadata: {
        modelName: result.modelName,
        endpoint: result.endpoint,
        requestId: result.requestId,
        seed: result.seed,
        prompt,
        negativePrompt,
      },
    })
    const publicUrl = persisted.publicUrl
    const mediaAssetId = persisted.mediaAssetId

    const updateData: Record<string, unknown> = {
      referenceImageId: mediaAssetId,
      referenceImageUrl: publicUrl,
    }
    if (body.setPrimary) {
      updateData.primaryImageId = mediaAssetId
    }

    await payload.update({
      collection: 'characters',
      id: characterId,
      data: updateData,
      overrideAccess: true,
    })

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      mediaAssetId,
      width: img.width,
      height: img.height,
      latencyMs: result.latencyMs,
      primarySet: body.setPrimary,
      savedPath,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'generation_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
