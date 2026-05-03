export const maxDuration = 30

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelFalJob } from '@/shared/ai/fal'
import { getCurrentUser } from '@/shared/auth/current-user'

const bodySchema = z.object({
  cancelUrl: z.string().url(),
})

export async function POST(req: Request) {
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

  // Only accept fal queue cancel URLs to prevent SSRF.
  if (!body.cancelUrl.startsWith('https://queue.fal.run/')) {
    return NextResponse.json({ error: 'invalid_cancel_url' }, { status: 400 })
  }

  try {
    const result = await cancelFalJob(body.cancelUrl)
    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      body: result.body,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cancel_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
