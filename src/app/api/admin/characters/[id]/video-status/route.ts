export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchVideoJobStatus } from '@/shared/ai/fal'
import { persistGeneratedVideo } from '@/features/media/persist-generated-video'
import { getCurrentUser } from '@/shared/auth/current-user'

const querySchema = z.object({
  requestId: z.string().min(1),
  endpoint: z.string().min(1),
  startedAt: z.coerce.number().optional(),
  motionStrength: z.string().optional(),
  mood: z.string().optional(),
  promptUsed: z.string().optional(),
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
    startedAt: url.searchParams.get('startedAt') ?? undefined,
    motionStrength: url.searchParams.get('motionStrength') ?? undefined,
    mood: url.searchParams.get('mood') ?? undefined,
    promptUsed: url.searchParams.get('promptUsed') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { id: characterId } = await params

  let jobStatus: Awaited<ReturnType<typeof fetchVideoJobStatus>>
  try {
    jobStatus = await fetchVideoJobStatus(
      parsed.data.endpoint,
      parsed.data.requestId,
      parsed.data.startedAt,
    )
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
      queuePosition: jobStatus.queuePosition ?? null,
    })
  }

  if (jobStatus.status === 'failed') {
    return NextResponse.json(
      { status: 'failed', error: jobStatus.error },
      { status: 500 },
    )
  }

  // Completed — mirror to R2 and create the media-asset row.
  const payload = await getPayload({ config })
  let persisted: Awaited<ReturnType<typeof persistGeneratedVideo>>
  try {
    persisted = await persistGeneratedVideo({
      payload,
      fromUrl: jobStatus.result.video.url,
      contentType: jobStatus.result.video.contentType,
      kind: 'character-video',
      ownerCharacterId: characterId,
      generationMetadata: {
        endpoint: jobStatus.result.endpoint,
        requestId: jobStatus.result.requestId,
        seed: jobStatus.result.seed,
        latencyMs: jobStatus.result.latencyMs,
        motionStrength: parsed.data.motionStrength,
        mood: parsed.data.mood,
        prompt: parsed.data.promptUsed,
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

  return NextResponse.json({
    status: 'completed',
    video: {
      url: persisted.publicUrl,
      mediaAssetId: persisted.mediaAssetId,
      contentType: jobStatus.result.video.contentType,
    },
    seed: jobStatus.result.seed,
    latencyMs: jobStatus.result.latencyMs,
  })
}
