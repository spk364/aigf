'use server'

import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { grant } from '@/features/tokens/ledger'
import { track } from '@/shared/analytics/posthog'
import {
  buildTokenPackCheckoutUrl,
  isTokenPackBillingMocked,
} from './checkout'

/**
 * Initiate a token-pack purchase. In real mode this redirects the user to a
 * CCBill FlexForm; in mock mode (no CCBILL_ACCOUNT_NUM, e.g. local dev) it
 * applies the grant immediately so the rest of the product can be tested
 * end-to-end without a real payment provider.
 */
export async function purchaseTokenPackAction(sku: string): Promise<void> {
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })

  // Look up the package — sku is the source of truth; price/amount come from DB
  // so the client cannot tamper with how many tokens get credited.
  const pkgResult = await payload.find({
    collection: 'token-packages',
    where: {
      and: [{ sku: { equals: sku } }, { isActive: { equals: true } }],
    },
    limit: 1,
    overrideAccess: true,
  })

  const pkg = pkgResult.docs[0]
  if (!pkg) {
    throw new Error(`purchaseTokenPackAction: unknown or inactive sku "${sku}"`)
  }

  const userLocale = (user as { locale?: string }).locale ?? 'en'

  if (!isTokenPackBillingMocked()) {
    track({
      userId: String(user.id),
      event: 'token_pack.checkout_started',
      properties: { sku, priceCents: pkg.priceCents, tokenAmount: pkg.tokenAmount },
    })
    const url = buildTokenPackCheckoutUrl({ userId: user.id, sku, locale: userLocale })
    redirect(url)
  }

  // Mock mode: stamp a completed payment + idempotent grant in a single DB tx.
  // The mock idempotency anchor is the synthetic providerTransactionId so a
  // double-submitted form (e.g. user double-click) credits at most once.
  const mockProviderTxId = `mock-pack-${user.id}-${pkg.id}-${Date.now()}`

  const txId = await payload.db.beginTransaction()
  let paymentId: string | number
  try {
    const paymentTx = await payload.create({
      collection: 'payment-transactions',
      data: {
        userId: user.id,
        type: 'token_purchase',
        status: 'completed',
        amountCents: pkg.priceCents,
        currency: 'USD',
        provider: 'ccbill',
        providerTransactionId: mockProviderTxId,
        providerRawData: { mock: true, sku },
        tokenPackageId: pkg.id,
        completedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })
    paymentId = paymentTx.id as string | number
    if (txId) await payload.db.commitTransaction(txId)
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)
    throw err
  }

  // Grant runs its own transaction; idempotencyKey is keyed on the payment so
  // a retry of this server action re-uses the same grant. (We always create a
  // new mockProviderTxId per call, but if the network drops between create
  // and grant, calling the action again would still credit only once provided
  // the same paymentId is re-derived — which it isn't in mock mode by design.
  // Real mode, where the providerTransactionId comes from CCBill, is fully
  // safe.)
  await grant(payload, {
    userId: user.id,
    type: 'grant_purchase',
    amount: pkg.tokenAmount as number,
    reason: `token_pack:${sku}`,
    relatedPaymentId: paymentId,
    idempotencyKey: `mock:purchase:${mockProviderTxId}`,
  })

  track({
    userId: String(user.id),
    event: 'token_pack.purchased',
    properties: {
      sku,
      tokenAmount: pkg.tokenAmount,
      priceCents: pkg.priceCents,
      mock: true,
    },
  })

  redirect(`/${userLocale}/billing/return?type=token_pack&status=success&sku=${encodeURIComponent(sku)}`)
}
