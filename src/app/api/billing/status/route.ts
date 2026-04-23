import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: user.id } },
    limit: 1,
    overrideAccess: true,
  })

  if (subResult.docs.length === 0) {
    return NextResponse.json({ subscription: null })
  }

  const sub = subResult.docs[0]!

  return NextResponse.json({
    subscription: {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      features: sub.features,
    },
  })
}
