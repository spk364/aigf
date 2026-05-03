import type { BasePayload } from 'payload'
import { grant } from '@/features/tokens/ledger'
import { PLANS, planFromCcbillForm } from '../plans'
import type { PlanKey } from '../plans'
import { track } from '@/shared/analytics/posthog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CcbillWebhookPayload = Record<string, unknown>

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100)
  if (typeof value === 'string') return Math.round(parseFloat(value) * 100)
  return 0
}

function periodEndDate(start: Date, billingPeriod: 'monthly' | 'yearly'): Date {
  const end = new Date(start)
  if (billingPeriod === 'yearly') {
    end.setFullYear(end.getFullYear() + 1)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return end
}

// ---------------------------------------------------------------------------
// handleNewSaleSuccess
// ---------------------------------------------------------------------------

export async function handleNewSaleSuccess(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  const userId = webhookPayload.customerId as string | undefined
  const transactionId = webhookPayload.transactionId as string | undefined
  const subscriptionId = webhookPayload.subscriptionId as string | undefined
  const formName = webhookPayload.formName as string | undefined

  if (!userId) throw new Error('handleNewSaleSuccess: missing customerId')

  const planKey: PlanKey = planFromCcbillForm(formName) ?? 'premium_monthly'
  const planConfig = PLANS[planKey]
  const amountCents = parseCents(webhookPayload.initialPrice)
  const now = new Date()
  const periodEnd = periodEndDate(now, planConfig.billingPeriod)

  const txId = await payload.db.beginTransaction()

  try {
    // 1. Upsert subscription
    const existing = await payload.find({
      collection: 'subscriptions',
      where: { userId: { equals: userId } },
      limit: 1,
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    let subId: string | number

    const subData = {
      plan: planKey,
      status: 'active' as const,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      provider: 'ccbill' as const,
      providerSubscriptionId: subscriptionId ?? null,
      amountCents,
      currency: 'USD',
      features: planConfig.features,
      lastTokenGrantDate: now.toISOString(),
    }

    if (existing.docs.length > 0) {
      const existingSub = existing.docs[0]!
      await payload.update({
        collection: 'subscriptions',
        id: existingSub.id as string,
        data: subData,
        overrideAccess: true,
        req: { transactionID: txId } as never,
      })
      subId = existingSub.id as string
    } else {
      const newSub = await payload.create({
        collection: 'subscriptions',
        data: { userId, ...subData },
        overrideAccess: true,
        req: { transactionID: txId } as never,
      })
      subId = newSub.id as string
    }

    // 2. Insert payment transaction
    const paymentTx = await payload.create({
      collection: 'payment-transactions',
      data: {
        userId,
        type: 'subscription_initial',
        status: 'completed',
        amountCents,
        currency: 'USD',
        provider: 'ccbill',
        providerTransactionId: transactionId ?? `ccbill-${Date.now()}-${subId}`,
        providerRawData: webhookPayload,
        subscriptionId: subId,
        completedAt: now.toISOString(),
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    // 3. Grant monthly tokens. Idempotent per CCBill transaction so a redelivered
    //    webhook does not credit twice.
    await grant(payload, {
      userId,
      type: 'grant_subscription',
      amount: planConfig.features.monthlyTokenAllocation,
      reason: 'subscription_initial',
      relatedPaymentId: paymentTx.id as string,
      idempotencyKey: `ccbill:newsale:${transactionId ?? subId}`,
    })

    if (txId) await payload.db.commitTransaction(txId)

    track({
      userId,
      event: 'purchase.succeeded',
      properties: { plan: planKey, amountCents, currency: 'USD' },
    })
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)
    throw err
  }
}

// ---------------------------------------------------------------------------
// handleRenewalSuccess
// ---------------------------------------------------------------------------

export async function handleRenewalSuccess(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  const subscriptionId = webhookPayload.subscriptionId as string | undefined
  const transactionId = webhookPayload.transactionId as string | undefined

  if (!subscriptionId) throw new Error('handleRenewalSuccess: missing subscriptionId')

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { providerSubscriptionId: { equals: subscriptionId } },
    limit: 1,
    overrideAccess: true,
  })

  if (subResult.docs.length === 0) {
    throw new Error(`handleRenewalSuccess: subscription not found for id ${subscriptionId}`)
  }

  const sub = subResult.docs[0]!
  const planKey = (sub.plan as PlanKey) ?? 'premium_monthly'
  const planConfig = PLANS[planKey]
  const amountCents = parseCents(webhookPayload.billingAmount ?? webhookPayload.initialPrice)
  const now = new Date()
  const currentEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd as string) : now
  const periodEnd = periodEndDate(currentEnd, planConfig.billingPeriod)

  const txId = await payload.db.beginTransaction()

  try {
    await payload.update({
      collection: 'subscriptions',
      id: sub.id as string,
      data: {
        currentPeriodEnd: periodEnd.toISOString(),
        lastTokenGrantDate: now.toISOString(),
        cancelAtPeriodEnd: false,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    const paymentTx = await payload.create({
      collection: 'payment-transactions',
      data: {
        userId: sub.userId,
        type: 'subscription_renewal',
        status: 'completed',
        amountCents,
        currency: 'USD',
        provider: 'ccbill',
        providerTransactionId: transactionId ?? `ccbill-renew-${Date.now()}`,
        providerRawData: webhookPayload,
        subscriptionId: sub.id,
        completedAt: now.toISOString(),
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    await grant(payload, {
      userId: sub.userId as string,
      type: 'grant_subscription',
      amount: planConfig.features.monthlyTokenAllocation,
      reason: 'subscription_renewal',
      relatedPaymentId: paymentTx.id as string,
      idempotencyKey: `ccbill:renewal:${transactionId ?? `${sub.id}:${now.toISOString().slice(0, 7)}`}`,
    })

    if (txId) await payload.db.commitTransaction(txId)
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)
    throw err
  }
}

// ---------------------------------------------------------------------------
// handleCancellation
// ---------------------------------------------------------------------------

export async function handleCancellation(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  const subscriptionId = webhookPayload.subscriptionId as string | undefined
  if (!subscriptionId) throw new Error('handleCancellation: missing subscriptionId')

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { providerSubscriptionId: { equals: subscriptionId } },
    limit: 1,
    overrideAccess: true,
  })

  if (subResult.docs.length === 0) {
    throw new Error(`handleCancellation: subscription not found for id ${subscriptionId}`)
  }

  const sub = subResult.docs[0]!

  await payload.update({
    collection: 'subscriptions',
    id: sub.id as string,
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// handleExpiration
// ---------------------------------------------------------------------------

export async function handleExpiration(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  const subscriptionId = webhookPayload.subscriptionId as string | undefined
  if (!subscriptionId) throw new Error('handleExpiration: missing subscriptionId')

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { providerSubscriptionId: { equals: subscriptionId } },
    limit: 1,
    overrideAccess: true,
  })

  if (subResult.docs.length === 0) {
    // Gracefully skip — subscription may have never been created
    console.warn(`[ccbill] handleExpiration: subscription not found for id ${subscriptionId}`)
    return
  }

  const sub = subResult.docs[0]!

  await payload.update({
    collection: 'subscriptions',
    id: sub.id as string,
    data: { status: 'expired' },
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// handleRefund
// ---------------------------------------------------------------------------

export async function handleRefund(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  const transactionId = webhookPayload.transactionId as string | undefined

  if (transactionId) {
    const txResult = await payload.find({
      collection: 'payment-transactions',
      where: { providerTransactionId: { equals: transactionId } },
      limit: 1,
      overrideAccess: true,
    })

    if (txResult.docs.length > 0) {
      const tx = txResult.docs[0]!
      await payload.update({
        collection: 'payment-transactions',
        id: tx.id as string,
        data: { status: 'refunded' },
        overrideAccess: true,
      })
    }
  }

  // Log for admin review — tokens are NOT revoked automatically
  await payload.create({
    collection: 'audit-logs',
    data: {
      actorType: 'system',
      actorId: 'ccbill-webhook',
      action: 'payment.refund',
      entityType: 'payment-transactions',
      entityId: transactionId ?? 'unknown',
      changes: { webhookPayload },
      reason: 'CCBill refund event — admin should review token retention',
    },
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// handleChargeback
// ---------------------------------------------------------------------------

export async function handleChargeback(
  payload: BasePayload,
  webhookPayload: CcbillWebhookPayload,
): Promise<void> {
  await handleRefund(payload, webhookPayload)

  const userId = webhookPayload.customerId as string | undefined
  if (!userId) return

  await payload.update({
    collection: 'users',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { id: { equals: userId } } as any,
    data: {
      status: 'suspended',
      suspensionReason: 'chargeback',
    },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'audit-logs',
    data: {
      actorType: 'system',
      actorId: 'ccbill-webhook',
      action: 'user.suspended',
      entityType: 'users',
      entityId: userId,
      changes: { reason: 'chargeback', webhookPayload },
      reason: 'CCBill chargeback event',
    },
    overrideAccess: true,
  })
}
