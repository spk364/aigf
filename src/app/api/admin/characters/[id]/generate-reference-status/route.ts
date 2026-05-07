export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchImageJobStatus } from '@/shared/ai/fal'
import { fetchAtlasImageJobStatus } from '@/shared/ai/atlas'
import {
  detectImageProvider,
  findImageModel,
} from '@/shared/ai/image-models'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { getCurrentUser } from '@/shared/auth/current-user'
import { saveGeneratedImageToDisk } from '@/shared/debug/save-generated-image'
import { fetchAndAnalyzeImage, detectSafetyFilteredFrame } from '@/shared/ai/image-analysis'

const querySchema = z.object({
  requestId: z.string().min(1),
  endpoint: z.string().min(1),
  modelName: z.string().min(1),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
  startedAt: z.coerce.number().optional(),
  promptUsed: z.string().optional(),
  negativePromptUsed: z.string().optional(),
  setPrimary: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    requestId: url.searchParams.get('requestId'),
    endpoint: url.searchParams.get('endpoint'),
    modelName: url.searchParams.get('modelName'),
    statusUrl: url.searchParams.get('statusUrl'),
    responseUrl: url.searchParams.get('responseUrl'),
    startedAt: url.searchParams.get('startedAt') ?? undefined,
    promptUsed: url.searchParams.get('promptUsed') ?? undefined,
    negativePromptUsed: url.searchParams.get('negativePromptUsed') ?? undefined,
    setPrimary: url.searchParams.get('setPrimary') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // SSRF guard — only accept queue URLs from providers we use.
  const ALLOWED_HOST_PREFIXES = [
    'https://queue.fal.run/',
    'https://api.atlascloud.ai/',
  ]
  const allowedUrl = (u: string) => ALLOWED_HOST_PREFIXES.some((p) => u.startsWith(p))
  if (!allowedUrl(parsed.data.statusUrl) || !allowedUrl(parsed.data.responseUrl)) {
    return NextResponse.json({ error: 'invalid_provider_urls' }, { status: 400 })
  }

  const { id: characterId } = await params

  // The reference flow does not pass modelUsed through the polling URL, so
  // detect provider from the status URL host. fal goes to queue.fal.run;
  // Atlas to api.atlascloud.ai. Endpoint slug is a secondary fallback.
  const provider = parsed.data.statusUrl.startsWith('https://api.atlascloud.ai/')
    ? 'atlas'
    : findImageModel(parsed.data.endpoint)?.provider ??
      detectImageProvider(parsed.data.endpoint)

  let jobStatus: Awaited<ReturnType<typeof fetchImageJobStatus>>
  try {
    const fetchArgs = {
      statusUrl: parsed.data.statusUrl,
      responseUrl: parsed.data.responseUrl,
      requestId: parsed.data.requestId,
      endpoint: parsed.data.endpoint,
      modelName: parsed.data.modelName,
      startedAtMs: parsed.data.startedAt,
    }
    jobStatus =
      provider === 'atlas'
        ? await fetchAtlasImageJobStatus(fetchArgs)
        : await fetchImageJobStatus(fetchArgs)
  } catch (err) {
    return NextResponse.json(
      {
        error: 'status_fetch_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  if (jobStatus.status === 'pending') {
    return NextResponse.json({
      status: 'pending',
      phase: jobStatus.phase,
      queuePosition: jobStatus.queuePosition ?? null,
      lastLog: jobStatus.lastLog ?? null,
      raw: jobStatus.raw ?? null,
    })
  }

  if (jobStatus.status === 'failed') {
    return NextResponse.json(
      { status: 'failed', error: jobStatus.error },
      { status: 500 },
    )
  }

  const img = jobStatus.result.images[0]
  if (!img) {
    return NextResponse.json(
      { status: 'failed', error: 'fal returned no images' },
      { status: 500 },
    )
  }

  try {
    const analysis = await fetchAndAnalyzeImage(img.url)
    const detection = detectSafetyFilteredFrame(analysis)
    if (detection.kind === 'filtered') {
      return NextResponse.json(
        { status: 'failed', error: detection.reason },
        { status: 200 },
      )
    }
  } catch (err) {
    console.warn('image analysis failed, persisting without quality gate', err)
  }

  const payload = await getPayload({ config })

  const savedPath = await saveGeneratedImageToDisk({
    imageUrl: img.url,
    model: jobStatus.result.modelName,
    width: img.width,
    height: img.height,
    kind: 'reference',
  })

  let persisted: Awaited<ReturnType<typeof persistGeneratedImage>>
  try {
    persisted = await persistGeneratedImage({
      payload,
      fromUrl: img.url,
      width: img.width,
      height: img.height,
      contentType: img.contentType,
      kind: 'character-reference',
      ownerCharacterId: characterId,
      generationMetadata: {
        modelName: jobStatus.result.modelName,
        endpoint: jobStatus.result.endpoint,
        requestId: jobStatus.result.requestId,
        seed: jobStatus.result.seed,
        prompt: parsed.data.promptUsed,
        negativePrompt: parsed.data.negativePromptUsed,
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'failed',
        error: 'persist_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  const updateData: Record<string, unknown> = {
    referenceImageId: persisted.mediaAssetId,
    referenceImageUrl: persisted.publicUrl,
  }
  if (parsed.data.setPrimary) {
    updateData.primaryImageId = persisted.mediaAssetId
  }

  try {
    await payload.update({
      collection: 'characters',
      id: characterId,
      data: updateData,
      overrideAccess: true,
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'failed',
        error: 'character_update_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    status: 'completed',
    url: persisted.publicUrl,
    mediaAssetId: persisted.mediaAssetId,
    width: img.width,
    height: img.height,
    latencyMs: jobStatus.result.latencyMs,
    primarySet: Boolean(parsed.data.setPrimary),
    savedPath,
  })
}
