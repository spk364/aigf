export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchImageJobStatus } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { getCurrentUser } from '@/shared/auth/current-user'
import { saveGeneratedImageToDisk } from '@/shared/debug/save-generated-image'
import { fetchAndAnalyzeImage, detectSafetyFilteredFrame } from '@/shared/ai/image-analysis'

const querySchema = z.object({
  requestId: z.string().min(1),
  endpoint: z.string().min(1),
  modelName: z.string().min(1),
  // fal-provided URLs from the original submit response.
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
  startedAt: z.coerce.number().optional(),
  // Carries through from submit so we can persist + update character on COMPLETED.
  promptUsed: z.string().optional(),
  negativePromptUsed: z.string().optional(),
  modelUsed: z.string().optional(),
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
    modelUsed: url.searchParams.get('modelUsed') ?? undefined,
    setPrimary: url.searchParams.get('setPrimary') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  if (
    !parsed.data.statusUrl.startsWith('https://queue.fal.run/') ||
    !parsed.data.responseUrl.startsWith('https://queue.fal.run/')
  ) {
    return NextResponse.json({ error: 'invalid_fal_urls' }, { status: 400 })
  }

  const { id: characterId } = await params

  let jobStatus: Awaited<ReturnType<typeof fetchImageJobStatus>>
  try {
    jobStatus = await fetchImageJobStatus({
      statusUrl: parsed.data.statusUrl,
      responseUrl: parsed.data.responseUrl,
      requestId: parsed.data.requestId,
      endpoint: parsed.data.endpoint,
      modelName: parsed.data.modelName,
      startedAtMs: parsed.data.startedAt,
    })
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

  // Completed — persist image, update character relationships.
  const img = jobStatus.result.images[0]
  if (!img) {
    return NextResponse.json(
      { status: 'failed', error: 'fal returned no images' },
      { status: 500 },
    )
  }

  // Detect fal's safety-filtered black frames before we mirror to R2 and
  // create a useless media-asset row. mean luminance < 5 + stddev < 2 is a
  // strong signal that fal swapped the real output for a uniform black PNG.
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
    // Analysis failure is non-fatal — fall through and persist anyway. The
    // admin will still see the image and can flag it manually if it's bad.
    console.warn('image analysis failed, persisting without quality gate', err)
  }

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
  if (!character) {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  const savedPath = await saveGeneratedImageToDisk({
    imageUrl: img.url,
    model: jobStatus.result.modelName,
    width: img.width,
    height: img.height,
    kind: 'gallery',
  })

  let persisted: Awaited<ReturnType<typeof persistGeneratedImage>>
  try {
    persisted = await persistGeneratedImage({
      payload,
      fromUrl: img.url,
      width: img.width,
      height: img.height,
      contentType: img.contentType,
      kind: 'character-gallery',
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

  const existingGallery = Array.isArray(character.galleryImageIds)
    ? (character.galleryImageIds as Array<{ id: string | number } | string | number>).map((e) =>
        typeof e === 'object' && e !== null && 'id' in e ? e.id : e,
      )
    : []

  const updateData: Record<string, unknown> = {
    galleryImageIds: [...existingGallery, persisted.mediaAssetId],
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
    persisted: true,
    primarySet: Boolean(parsed.data.setPrimary),
    modelUsed: parsed.data.modelUsed ?? jobStatus.result.modelName,
    promptUsed: parsed.data.promptUsed ?? '',
    savedPath,
  })
}
