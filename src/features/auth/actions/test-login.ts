'use server'

import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import type { BasePayload } from 'payload'
import config from '@payload-config'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../test-login-config'
import { grant, getBalance } from '@/features/tokens/ledger'

// The demo account is advertised as "Premium Plus with plenty of tokens" on the
// login screen. Ensure that's actually true on every login — idempotently grant
// an active premium_plus subscription and top the balance up to a high floor —
// so a demo user never hits a paywall or tier cap while exploring.
const DEMO_TOKEN_FLOOR = 1_000_000

async function ensureDemoEntitlements(payload: BasePayload, userId: string | number) {
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const subData = {
    userId,
    plan: 'premium_plus_monthly' as const,
    status: 'active' as const,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    provider: 'manual' as const,
    amountCents: 0,
    currency: 'USD' as const,
    features: {
      monthlyTokenAllocation: 300,
      llmTier: 'premium_plus' as const,
      videoEnabled: true,
      monthlyVideoQuota: 5,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  }
  const existingSub = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: userId } },
    limit: 1,
    overrideAccess: true,
  })
  if (existingSub.docs.length === 0) {
    await payload.create({ collection: 'subscriptions', data: subData, overrideAccess: true })
  } else {
    await payload.update({ collection: 'subscriptions', id: existingSub.docs[0]!.id, data: subData, overrideAccess: true })
  }

  const balance = await getBalance(payload, userId)
  if (balance < DEMO_TOKEN_FLOOR) {
    await grant(payload, {
      userId,
      type: 'admin_adjustment',
      amount: DEMO_TOKEN_FLOOR - balance,
      reason: 'demo_user_topup',
    })
  }
}

export async function loginAsTestUserAction(): Promise<{ success: boolean; error?: string }> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: TEST_USER_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })

  let demoUserId: string | number
  if (existing.docs.length === 0) {
    const now = new Date().toISOString()
    const created = await payload.create({
      collection: 'users',
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        roles: ['user'],
        emailVerified: true,
        emailVerifiedAt: now,
        displayName: 'Demo User',
        locale: 'en',
        preferredLanguage: 'auto',
        dateOfBirth: '1995-01-01T00:00:00.000Z',
        ageVerifiedAt: now,
        ageVerificationMethod: 'self_declaration',
        nsfwEnabled: true,
        nsfwEnabledAt: now,
        status: 'active',
        _verified: true,
      } as never,
      overrideAccess: true,
    })
    demoUserId = created.id
  } else {
    demoUserId = existing.docs[0]!.id
  }

  // Make the "Premium Plus + plenty of tokens" promise true on every login.
  try {
    await ensureDemoEntitlements(payload, demoUserId)
  } catch {
    // Non-blocking — login should still succeed even if the top-up hiccups.
  }

  try {
    const result = await payload.login({
      collection: 'users',
      data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    })

    const cookieStore = await cookies()
    cookieStore.set('payload-token', result.token ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return { success: true }
  } catch {
    return { success: false, error: 'Test login failed.' }
  }
}
