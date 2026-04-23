import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { generateImage } from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'

const bodySchema = z.object({
  prompt: z.string().min(1).max(1000),
  negativePrompt: z.string().max(1000).optional(),
  imageSize: z
    .enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'])
    .optional(),
  numImages: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().optional(),
  // When true, each generated image is mirrored to R2 and a media-assets row is created.
  persist: z.boolean().default(false),
})

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_available_in_production' }, { status: 403 })
  }

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

  try {
    const result = await generateImage(body)

    if (!body.persist) {
      // Raw fal URLs returned without persistence — no R2 env vars required.
      return NextResponse.json({ ok: true, ...result })
    }

    // Mirror each image to R2 and create media-assets rows.
    const payload = await getPayload({ config })

    const persistedImages = await Promise.all(
      result.images.map(async (img) => {
        const persisted = await persistGeneratedImage({
          payload,
          fromUrl: img.url,
          width: img.width,
          height: img.height,
          contentType: img.contentType,
          kind: 'message-image',
          ownerUserId: user.id,
          generationMetadata: {
            modelName: result.modelName,
            endpoint: result.endpoint,
            requestId: result.requestId,
            seed: result.seed,
            prompt: body.prompt,
            negativePrompt: body.negativePrompt,
          },
        })
        return {
          url: persisted.publicUrl,
          width: img.width,
          height: img.height,
          contentType: img.contentType,
          mediaAssetId: persisted.mediaAssetId,
        }
      }),
    )

    return NextResponse.json({
      ok: true,
      endpoint: result.endpoint,
      modelName: result.modelName,
      seed: result.seed,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
      images: persistedImages,
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
