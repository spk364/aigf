import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { getBalance } from '@/features/tokens/ledger'

// Lightweight balance read used by the chat composer to preview per-action
// costs (photo / voice / video). Cached `no-store` because token spends from
// other routes (image, TTS) need to invalidate the chip immediately.
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const balance = await getBalance(payload, user.id)

  return NextResponse.json(
    { balance },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  )
}
