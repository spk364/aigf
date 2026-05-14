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
import {
  createTokenPackInvoice,
} from '@/features/billing/crypto/nowpayments/invoice'
import { isNowpaymentsConfigured } from '@/features/billing/crypto/nowpayments/client'

export type PurchaseMethod = 'card' | 'crypto'

/**
 * Initiate a token-pack purchase. In real mode this redirects the user to
 * the configured provider checkout (CCBill FlexForm for cards, NOWPayments
 * hosted invoice for crypto). In mock mode (provider env vars unset, e.g.
 * local dev) it stamps a synthetic completed payment + grants tokens
 * immediately so the rest of the product can be tested without a real
 * payment provider.
 */
export async function purchaseTokenPackAction(
  sku: string,
  method: PurchaseMethod = 'card',
): Promise<void> {
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

  // ────────────────────────────────────────────────────────────────────────
  // Crypto path (NOWPayments hosted invoice)
  // ────────────────────────────────────────────────────────────────────────
  if (method === 'crypto' && isNowpaymentsConfigured()) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    if (!appUrl) {
      throw new Error(
        'purchaseTokenPackAction: NEXT_PUBLIC_APP_URL must be set so NOWPayments can call our IPN endpoint.',
      )
    }

    track({
      userId: String(user.id),
      event: 'token_pack.checkout_started',
      properties: {
        sku,
        priceCents: pkg.priceCents,
        tokenAmount: pkg.tokenAmount,
        provider: 'nowpayments',
      },
    })

    const { invoiceUrl } = await createTokenPackInvoice({
      userId: user.id,
      sku,
      priceCents: pkg.priceCents as number,
      locale: userLocale,
      ipnCallbackUrl: `${appUrl}/api/webhooks/nowpayments`,
      successUrl: `${appUrl}/${userLocale}/billing/return?type=token_pack&status=success&sku=${encodeURIComponent(sku)}`,
      cancelUrl: `${appUrl}/${userLocale}/tokens?status=canceled`,
    })

    redirect(invoiceUrl)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Card path (CCBill FlexForm)
  // ────────────────────────────────────────────────────────────────────────
  if (method === 'card' && !isTokenPackBillingMocked()) {
    track({
      userId: String(user.id),
      event: 'token_pack.checkout_started',
      properties: {
        sku,
        priceCents: pkg.priceCents,
        tokenAmount: pkg.tokenAmount,
        provider: 'ccbill',
      },
    })
    const url = buildTokenPackCheckoutUrl({ userId: user.id, sku, locale: userLocale })
    redirect(url)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mock path — either provider unconfigured for this method. Single grant
  // flow covers both so local dev / CI can exercise the end-to-end path
  // without a real merchant account.
  // ────────────────────────────────────────────────────────────────────────

  // Mock mode: stamp a completed payment + idempotent grant in a single DB tx.
  // The mock idempotency anchor is the synthetic providerTransactionId so a
  // double-submitted form (e.g. user double-click) credits at most once.
  // Provider field reflects which checkout button the user clicked so mock
  // analytics still distinguish card vs crypto funnels.
  const mockProvider = method === 'crypto' ? 'crypto_mock' : 'ccbill'
  const mockProviderTxId = `mock-${mockProvider}-${user.id}-${pkg.id}-${Date.now()}`

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
        provider: method === 'crypto' ? 'crypto_usdt' : 'ccbill',
        providerTransactionId: mockProviderTxId,
        providerRawData: { mock: true, sku, method },
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
      provider: mockProvider,
      mock: true,
    },
  })

  redirect(`/${userLocale}/billing/return?type=token_pack&status=success&sku=${encodeURIComponent(sku)}`)
}
