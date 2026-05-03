// Submit-only — Vercel Hobby caps at 60s. Polling lives in the client; the
// /generate-image-status route handles status checks and persistence.
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  submitImageJob,
  FAL_IMAGE_ENDPOINT,
  FAL_ENDPOINT_LORA,
  FAL_ENDPOINT_IP_ADAPTER_FACE_ID,
} from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'
import {
  IMAGE_MODEL_OPTIONS,
  IMAGE_SIZE_PRESETS,
  DEFAULT_IMAGE_SIZE_PRESET_ID,
  resolveImageSize,
} from '@/shared/ai/image-models'

const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const BASE_NEGATIVE =
  'low quality, blurry, deformed, bad anatomy, extra limbs, watermark, text, signature'

const PONY_PREFIX = 'score_9, score_8_up, score_7_up, score_6_up'

const VALID_MODEL_IDS = IMAGE_MODEL_OPTIONS.map((m) => m.id)
const VALID_SIZE_IDS = IMAGE_SIZE_PRESETS.map((p) => p.id) as [string, ...string[]]

const bodySchema = z.object({
  setPrimary: z.boolean().default(false),
  imageSize: z.enum(VALID_SIZE_IDS).default(DEFAULT_IMAGE_SIZE_PRESET_ID),
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

  const requestedModel = body.modelOverride && VALID_MODEL_IDS.includes(body.modelOverride)
    ? body.modelOverride
    : null
  const imageModel = character.imageModel as { primary?: string; checkpoint?: string } | null
  const resolvedModel = requestedModel ?? imageModel?.primary ?? FAL_IMAGE_ENDPOINT

  const isHfCheckpoint = !resolvedModel.startsWith('fal-ai/')
  const fallbackEndpoint = isHfCheckpoint ? FAL_ENDPOINT_LORA : resolvedModel
  const fallbackModelName = isHfCheckpoint ? resolvedModel : (imageModel?.checkpoint ?? undefined)

  const modelMeta = IMAGE_MODEL_OPTIONS.find((m) => m.id === resolvedModel)
  const isPony = modelMeta?.isPony ?? false
  const isFlux = modelMeta?.isFlux ?? false

  const safetyMarkers = appearance?.safetyAdultMarkers?.join(', ') ?? ''
  const scene = body.sceneHint?.trim() ?? ''

  let prompt: string

  if (isFlux) {
    const subjectDesc = appearance?.subjectTokens
      ? appearance.subjectTokens.replace(/, /g, ' with ')
      : 'a beautiful young woman'
    if (scene) {
      prompt = `${scene}. The woman is ${subjectDesc}. Photorealistic, high quality, 18+ adult woman.`
    } else {
      prompt = `Portrait of ${subjectDesc}. Photorealistic, high quality, soft natural lighting, 18+ adult woman.`
    }
  } else if (scene && appearance?.subjectTokens) {
    prompt = [
      'RAW photo',
      scene,
      appearance.subjectTokens,
      safetyMarkers,
      '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture',
    ].filter(Boolean).join(', ')
  } else if (appearance?.appearancePrompt) {
    prompt = [appearance.appearancePrompt, safetyMarkers, scene].filter(Boolean).join(', ')
  } else {
    prompt = [
      scene || 'portrait of a beautiful young woman, photorealistic, high detail, soft natural lighting',
      safetyMarkers || 'adult woman, (18+ years old:1.3)',
      '8k uhd, photorealistic, realistic skin texture',
    ].filter(Boolean).join(', ')
  }

  if (isPony) {
    prompt = `${PONY_PREFIX}, ${prompt}`
  }

  const negativePrompt = appearance?.negativePrompt
    ? `${appearance.negativePrompt}, ${SAFETY_NEGATIVE}`
    : `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}`

  const referenceImageUrl = character.referenceImageUrl as string | null

  // IP-Adapter is preferred when a reference exists and the model isn't FLUX.
  // We submit a single job; the client polls. If IP-Adapter fails at submit
  // time (rare — usually fails during inference), we fall back to plain endpoint.
  const useIpAdapter = Boolean(referenceImageUrl) && !isFlux
  const submitEndpoint = useIpAdapter ? FAL_ENDPOINT_IP_ADAPTER_FACE_ID : fallbackEndpoint
  const submitModelName = useIpAdapter ? undefined : fallbackModelName

  let job: Awaited<ReturnType<typeof submitImageJob>>
  try {
    job = await submitImageJob({
      prompt,
      negativePrompt,
      imageSize: resolveImageSize(body.imageSize),
      numImages: 1,
      endpoint: submitEndpoint,
      modelName: submitModelName,
      ...(useIpAdapter && referenceImageUrl
        ? { ipAdapterImageUrl: referenceImageUrl, ipAdapterScale: 0.7 }
        : {}),
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
    modelUsed: resolvedModel,
    setPrimary: body.setPrimary,
    startedAt: Date.now(),
  })
}
