// Dev user — used by DEV_AUTH_BYPASS to short-circuit auth in local development.
// This seed is idempotent: running it multiple times only resets the dev user
// state to a known baseline (premium plus, plenty of tokens, age-verified).
//
// NEVER run this in production. The seed entrypoint refuses if NODE_ENV === 'production'.

import type { Payload } from 'payload'
import { grant } from '@/features/tokens/ledger'

export const DEV_USER_EMAIL = 'dev@local.test'
const DEV_USER_PASSWORD = 'dev-password-12345'
const DEV_USER_DOB = '1990-01-01T00:00:00.000Z'
const DEV_TOKEN_FLOOR = 500
const DEV_PERIOD_DAYS = 30

async function findDevUser(payload: Payload) {
  const result = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_USER_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export async function seedDevUser(payload: Payload): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seedDevUser refuses to run in production')
  }

  let user = await findDevUser(payload)

  if (!user) {
    user = await payload.create({
      collection: 'users',
      data: {
        email: DEV_USER_EMAIL,
        password: DEV_USER_PASSWORD,
        roles: ['admin', 'user'],
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        displayName: 'Dev User',
        locale: 'en',
        preferredLanguage: 'auto',
        dateOfBirth: DEV_USER_DOB,
        ageVerifiedAt: new Date().toISOString(),
        ageVerificationMethod: 'self_declaration',
        nsfwEnabled: true,
        nsfwEnabledAt: new Date().toISOString(),
        status: 'active',
        // Mark as already verified so Payload's verify flow doesn't lock it out.
        // _verified is Payload's internal flag.
        _verified: true,
      } as never,
      overrideAccess: true,
    })
    payload.logger.info(`[seed] Created dev user ${DEV_USER_EMAIL}`)
  } else {
    user = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        roles: ['admin', 'user'],
        emailVerified: true,
        nsfwEnabled: true,
        status: 'active',
        dateOfBirth: DEV_USER_DOB,
      },
      overrideAccess: true,
    })
    payload.logger.info(`[seed] Refreshed dev user ${DEV_USER_EMAIL}`)
  }

  // Active premium_plus subscription so the dev user has unlimited messages,
  // NSFW unlocked, and the highest tier of tokens.
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: user.id } },
    limit: 1,
    overrideAccess: true,
  })

  const now = new Date()
  const periodEnd = new Date(now.getTime() + DEV_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  const subData = {
    userId: user.id,
    plan: 'premium_plus_monthly' as const,
    status: 'active' as const,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    provider: 'manual' as const,
    amountCents: 0,
    currency: 'USD',
    features: {
      monthlyTokenAllocation: 300,
      llmTier: 'premium_plus',
      videoEnabled: true,
      monthlyVideoQuota: 5,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  }

  if (subResult.docs.length === 0) {
    await payload.create({
      collection: 'subscriptions',
      data: subData,
      overrideAccess: true,
    })
    payload.logger.info('[seed] Created dev subscription (premium_plus)')
  } else {
    await payload.update({
      collection: 'subscriptions',
      id: subResult.docs[0]!.id,
      data: subData,
      overrideAccess: true,
    })
    payload.logger.info('[seed] Refreshed dev subscription')
  }

  // Top up tokens to a comfortable floor without writing the balance directly:
  // go through the ledger so the validator stays happy.
  const balResult = await payload.find({
    collection: 'token-balances',
    where: { userId: { equals: user.id } },
    limit: 1,
    overrideAccess: true,
  })
  const currentBalance = (balResult.docs[0]?.balance as number | undefined) ?? 0
  if (currentBalance < DEV_TOKEN_FLOOR) {
    const topUp = DEV_TOKEN_FLOOR - currentBalance
    await grant(payload, {
      userId: user.id,
      type: 'admin_adjustment',
      amount: topUp,
      reason: 'dev_user_topup',
    })
    payload.logger.info(`[seed] Granted ${topUp} dev tokens (floor=${DEV_TOKEN_FLOOR})`)
  }
}
