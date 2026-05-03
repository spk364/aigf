export const maxDuration = 60

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { submitVideoJob, FAL_ENDPOINT_WAN_V22_I2V } from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'
import {
  MOTION_PRESETS,
  buildVideoPrompt,
  VIDEO_NEGATIVE_PROMPT,
  MIN_SOURCE_RESOLUTION_PIXELS,
  type MotionStrength,
  type MotionMood,
} from '@/features/video/motion-presets'

const bodySchema = z.object({
  motionStrength: z.enum(['subtle', 'medium', 'strong']).default('medium'),
  mood: z.enum(['gentle', 'playful', 'intimate']).default('gentle'),
  motionDescription: z.string().max(500).default(''),
  resolution: z.enum(['480p', '580p', '720p']).default('720p'),
  // Optional override — caller passes a specific media-asset id (e.g. a gallery
  // image rather than the primary one).
  sourceMediaAssetId: z.union([z.string(), z.number()]).optional(),
  // Advanced: when set, sent verbatim to fal.ai instead of building from
  // motionDescription + mood + motionStrength. Negative prompt stays the
  // safety stack regardless.
  customPrompt: z.string().min(1).max(2000).optional(),
  // Advanced: override the safety negative. Pass an empty string to keep the
  // default stack — undefined leaves it as-is.
  customNegativePrompt: z.string().max(2000).optional(),
})

type CharacterForVideo = {
  id: string | number
  deletedAt?: string | null
  primaryImageId?: { id: string | number; publicUrl?: string; width?: number; height?: number } | string | number | null
  referenceImageUrl?: string | null
  referenceImageId?: string | number | null
  name?: string
}

function relPublicUrl(rel: unknown): string | null {
  if (rel == null || typeof rel !== 'object') return null
  const obj = rel as { publicUrl?: string }
  return typeof obj.publicUrl === 'string' ? obj.publicUrl : null
}

function relDimensions(rel: unknown): { width: number; height: number } | null {
  if (rel == null || typeof rel !== 'object') return null
  const obj = rel as { width?: number; height?: number }
  if (typeof obj.width === 'number' && typeof obj.height === 'number') {
    return { width: obj.width, height: obj.height }
  }
  return null
}

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

  let character: CharacterForVideo
  try {
    character = (await payload.findByID({
      collection: 'characters',
      id: characterId,
      depth: 1,
      overrideAccess: true,
    })) as CharacterForVideo
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  if (!character || character.deletedAt) {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  // Resolve source image: explicit override > primaryImageId > referenceImageUrl.
  let sourceImageUrl: string | null = null
  let sourceDimensions: { width: number; height: number } | null = null

  if (body.sourceMediaAssetId) {
    try {
      const asset = (await payload.findByID({
        collection: 'media-assets',
        id: body.sourceMediaAssetId,
        overrideAccess: true,
      })) as { publicUrl?: string; width?: number; height?: number } | null
      if (asset?.publicUrl) {
        sourceImageUrl = asset.publicUrl
        sourceDimensions = relDimensions(asset)
      }
    } catch {
      // fall through to other sources
    }
  }

  if (!sourceImageUrl) {
    sourceImageUrl = relPublicUrl(character.primaryImageId)
    sourceDimensions = relDimensions(character.primaryImageId)
  }
  if (!sourceImageUrl && character.referenceImageUrl) {
    sourceImageUrl = character.referenceImageUrl
  }

  if (!sourceImageUrl) {
    return NextResponse.json(
      { error: 'no_source_image', message: 'Generate a primary or reference image first.' },
      { status: 400 },
    )
  }

  const motionStrength = body.motionStrength as MotionStrength
  const mood = body.mood as MotionMood
  const preset = MOTION_PRESETS[motionStrength]

  const prompt =
    body.customPrompt && body.customPrompt.trim().length > 0
      ? body.customPrompt.trim()
      : buildVideoPrompt({
          motionDescription: body.motionDescription,
          mood,
          motionStrength,
        })

  const negativePrompt =
    typeof body.customNegativePrompt === 'string'
      ? body.customNegativePrompt
      : VIDEO_NEGATIVE_PROMPT

  // Resolution warning — fired alongside the response, not blocking, so the
  // admin gets feedback but can still proceed.
  let resolutionWarning: string | null = null
  if (sourceDimensions) {
    const px = sourceDimensions.width * sourceDimensions.height
    if (px < MIN_SOURCE_RESOLUTION_PIXELS) {
      resolutionWarning = `Source is ${sourceDimensions.width}×${sourceDimensions.height} — below the recommended 1024×1536. Motion quality may suffer.`
    }
  }

  let submission: { requestId: string; endpoint: string }
  try {
    submission = await submitVideoJob({
      imageUrl: sourceImageUrl,
      prompt,
      negativePrompt,
      numFrames: preset.numFrames,
      guidanceScale: preset.guidanceScale,
      shift: preset.shift,
      numInferenceSteps: preset.numInferenceSteps,
      resolution: body.resolution,
      endpoint: FAL_ENDPOINT_WAN_V22_I2V,
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
    requestId: submission.requestId,
    endpoint: submission.endpoint,
    sourceImageUrl,
    sourceDimensions,
    promptUsed: prompt,
    motionStrength,
    mood,
    resolutionWarning,
    startedAt: Date.now(),
  })
}
