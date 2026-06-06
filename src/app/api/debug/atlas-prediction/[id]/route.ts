// Diagnostic-only: fetch the raw Atlas prediction status for a given request id.
//
// Chat photos sometimes sit in `processing` forever on
// `alibaba/wan-2.6/text-to-image`. Our normal poller maps Atlas's response into
// a small status enum, which hides whatever Atlas is really reporting (an error,
// a moderation hold, an unrecognized terminal status, or genuine slowness).
// This endpoint returns Atlas's full raw response so we can see the truth from
// the browser, without server-log access.
//
// Usage: GET /api/debug/atlas-prediction/<requestId>  (must be signed in)

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/shared/auth/current-user'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'missing request id' }, { status: 400 })
  }

  const key = process.env.ATLAS_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'ATLAS_API_KEY not set in this environment' }, { status: 500 })
  }

  const url = `${ATLAS_BASE}/model/prediction/${encodeURIComponent(id)}`
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
  } catch (e) {
    return NextResponse.json(
      { error: 'fetch_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  const text = await res.text().catch(() => '')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text.slice(0, 4000)
  }

  // Return Atlas's full raw response so we can see the real status / error.
  return NextResponse.json({ httpStatus: res.status, ok: res.ok, body })
}
