// Submit-only — Vercel Hobby caps at 60s, RealVis + queue often exceeds.
// Polling lives in the client; /generate-reference-status finishes the job.
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { submitImageJob, FAL_ENDPOINT_REALISTIC_VISION, FAL_ENDPOINT_FAST_SDXL } from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'
import { IMAGE_MODEL_OPTIONS } from '@/shared/ai/image-models'

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

  const VALID_MODEL_IDS = IMAGE_MODEL_OPTIONS.map((m) => m.id)
  const requestedModel = body.modelOverride && VALID_MODEL_IDS.includes(body.modelOverride)
    ? body.modelOverride
    : null
  const requestedMeta = requestedModel
    ? IMAGE_MODEL_OPTIONS.find((m) => m.id === requestedModel)
    : null
  const isPonyOverride = requestedMeta?.isPony ?? false

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

  let job: Awaited<ReturnType<typeof submitImageJob>>
  try {
    job = await submitImageJob({
      prompt,
      negativePrompt,
      imageSize: { width: 832, height: 1216 },
      numImages: 1,
      numInferenceSteps: 25,
      guidanceScale: 7,
      endpoint,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'submit_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    requestId: job.requestId,
    endpoint: job.endpoint,
    modelName: job.modelName,
    statusUrl: job.statusUrl,
    responseUrl: job.responseUrl,
    cancelUrl: job.cancelUrl,
    promptUsed: prompt,
    negativePromptUsed: negativePrompt,
    setPrimary: body.setPrimary,
    startedAt: Date.now(),
  })
}
