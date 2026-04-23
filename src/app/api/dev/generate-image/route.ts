import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateImage } from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'

const bodySchema = z.object({
  prompt: z.string().min(1).max(1000),
  negativePrompt: z.string().max(1000).optional(),
  imageSize: z
    .enum(['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'])
    .optional(),
  numImages: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().optional(),
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
    return NextResponse.json({ ok: true, ...result })
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
