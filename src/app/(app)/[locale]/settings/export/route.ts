// GDPR data export endpoint (Art. 15/20). Returns the authenticated user's
// complete personal data as a downloadable JSON file. Auth'd as the user (not a
// cron) — anyone can export their OWN data, nobody else's.
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { getAccountState } from '@/shared/auth/account-status'
import { buildUserDataExport } from '@/features/gdpr/export'
import { track } from '@/shared/analytics/posthog'

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Banned/suspended users can still export (GDPR right is unconditional), but a
  // purged/deleted account has no data left to export.
  const access = getAccountState(user)
  if (access.blocked && access.reason === 'deleted') {
    return NextResponse.json({ error: 'account_deleted' }, { status: 410 })
  }

  const payload = await getPayload({ config })
  const data = await buildUserDataExport(payload, user.id)

  track({ userId: String(user.id), event: 'settings.data_exported', properties: {} })

  const filename = `gfai-data-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
