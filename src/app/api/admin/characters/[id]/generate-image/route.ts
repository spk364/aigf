export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { generateImage, FAL_IMAGE_ENDPOINT, FAL_ENDPOINT_LORA, FAL_ENDPOINT_IP_ADAPTER_FACE_ID, type GenerateImageResult } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { getCurrentUser } from '@/shared/auth/current-user'
import { IMAGE_MODEL_OPTIONS } from '@/shared/ai/image-models'
import { saveGeneratedImageToDisk } from '@/shared/debug/save-generated-image'

const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const BASE_NEGATIVE =
  'low quality, blurry, deformed, bad anatomy, extra limbs, watermark, text, signature'

// Pony/Illustrious SDXL checkpoints need score_ quality tokens at the front.
const PONY_PREFIX = 'score_9, score_8_up, score_7_up, score_6_up'

const VALID_MODEL_IDS = IMAGE_MODEL_OPTIONS.map((m) => m.id)

const bodySchema = z.object({
  setPrimary: z.boolean().default(false),
  imageSize: z
    .enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'])
    .default('portrait_4_3'),
  sceneHint: z.string().max(2000).optional(),
  modelOverride: z.string().optional(),
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

  // Resolve which model to use: request override > character setting > default
  const requestedModel = body.modelOverride && VALID_MODEL_IDS.includes(body.modelOverride)
    ? body.modelOverride
    : null
  const imageModel = character.imageModel as { primary?: string; checkpoint?: string } | null
  const resolvedModel = requestedModel ?? imageModel?.primary ?? FAL_IMAGE_ENDPOINT

  const isHfCheckpoint = !resolvedModel.startsWith('fal-ai/')
  const endpoint = isHfCheckpoint ? FAL_ENDPOINT_LORA : resolvedModel
  const modelName = isHfCheckpoint ? resolvedModel : (imageModel?.checkpoint ?? undefined)

  const modelMeta = IMAGE_MODEL_OPTIONS.find((m) => m.id === resolvedModel)
  const isPony = modelMeta?.isPony ?? false
  const isFlux = modelMeta?.isFlux ?? false

  const safetyMarkers = appearance?.safetyAdultMarkers?.join(', ') ?? ''
  const scene = body.sceneHint?.trim() ?? ''

  let prompt: string

  if (isFlux) {
    // FLUX works best with natural language sentences, not SD token lists.
    const subjectDesc = appearance?.subjectTokens
      ? appearance.subjectTokens.replace(/, /g, ' with ')
      : 'a beautiful young woman'
    if (scene) {
      prompt = `${scene}. The woman is ${subjectDesc}. Photorealistic, high quality, 18+ adult woman.`
    } else {
      prompt = `Portrait of ${subjectDesc}. Photorealistic, high quality, soft natural lighting, 18+ adult woman.`
    }
  } else if (scene && appearance?.subjectTokens) {
    // Scene-driven SD prompt: scene first (highest attention weight), then subject, then quality.
    // Never use "portrait of" framing — it conflicts with full-body poses.
    prompt = [
      'RAW photo',
      scene,
      appearance.subjectTokens,
      safetyMarkers,
      '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture',
    ].filter(Boolean).join(', ')
  } else if (appearance?.appearancePrompt) {
    // Portrait SD prompt (no scene hint).
    prompt = [
      appearance.appearancePrompt,
      safetyMarkers,
      scene,
    ].filter(Boolean).join(', ')
  } else {
    prompt = [
      scene || 'portrait of a beautiful young woman, photorealistic, high detail, soft natural lighting',
      safetyMarkers || 'adult woman, (18+ years old:1.3)',
      '8k uhd, photorealistic, realistic skin texture',
    ].filter(Boolean).join(', ')
  }

  // Pony/Illustrious checkpoints need score_ prefix tokens for quality steering.
  if (isPony) {
    prompt = `${PONY_PREFIX}, ${prompt}`
  }

  const negativePrompt = appearance?.negativePrompt
    ? `${appearance.negativePrompt}, ${SAFETY_NEGATIVE}`
    : `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}`

  const referenceImageUrl = character.referenceImageUrl as string | null

  try {
    // Route through IP-Adapter when a reference image exists and the model is not FLUX.
    // Falls back to standard generation on any IP-Adapter error.
    let result: GenerateImageResult
    if (referenceImageUrl && !isFlux) {
      try {
        result = await generateImage({
          prompt,
          negativePrompt,
          imageSize: body.imageSize,
          numImages: 1,
          endpoint: FAL_ENDPOINT_IP_ADAPTER_FACE_ID,
          ipAdapterImageUrl: referenceImageUrl,
          ipAdapterScale: 0.7,
        })
      } catch {
        result = await generateImage({
          prompt,
          negativePrompt,
          imageSize: body.imageSize,
          numImages: 1,
          endpoint,
          modelName,
        })
      }
    } else {
      result = await generateImage({
        prompt,
        negativePrompt,
        imageSize: body.imageSize,
        numImages: 1,
        endpoint,
        modelName,
      })
    }

    const img = result.images[0]!

    const savedPath = await saveGeneratedImageToDisk({
      imageUrl: img.url,
      model: result.modelName,
      width: img.width,
      height: img.height,
      kind: 'gallery',
    })

    let publicUrl = img.url
    let mediaAssetId: string | number | null = null

    const persisted = await persistGeneratedImage({
      payload,
      fromUrl: img.url,
      width: img.width,
      height: img.height,
      contentType: img.contentType,
      kind: 'character-gallery',
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
    publicUrl = persisted.publicUrl
    mediaAssetId = persisted.mediaAssetId

    // Append to galleryImageIds; optionally promote to primaryImageId.
    const existingGallery = Array.isArray(character.galleryImageIds)
      ? (character.galleryImageIds as Array<{ id: string | number } | string | number>).map((e) =>
          typeof e === 'object' && e !== null && 'id' in e ? e.id : e,
        )
      : []

    const updateData: Record<string, unknown> = {
      galleryImageIds: [...existingGallery, mediaAssetId],
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
      persisted: mediaAssetId !== null,
      primarySet: body.setPrimary && mediaAssetId !== null,
      modelUsed: resolvedModel,
      promptUsed: prompt,
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
