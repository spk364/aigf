// TODO(post-mvp): Add NOWPayments subscription / recurring crypto payments.

import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { grant } from '@/features/tokens/ledger'
import { getRequestContext } from '@/shared/lib/request-context'
import { createLogger } from '@/shared/lib/logger'

type NowPaymentsBody = {
  payment_id?: string | number
  payment_status?: string
  order_id?: string
  price_amount?: number
  price_currency?: string
  pay_currency?: string
  actually_paid?: number
  [key: string]: unknown
}

function verifyHmac(body: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha512', secret)
  hmac.update(body)
  const expected = hmac.digest('hex')
  // Constant-time comparison
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/** Parse order_id: tokens_{userId}_{packageSku}_{nonce} */
function parseOrderId(orderId: string): { userId: string; packageSku: string } | null {
  const parts = orderId.split('_')
  // Minimum format: tokens _ userId _ packageSku _ nonce → 4 parts
  if (parts.length < 4 || parts[0] !== 'tokens') return null
  const userId = parts[1]!
  // sku may contain underscores; nonce is always last segment
  const packageSku = parts.slice(2, -1).join('_')
  return { userId, packageSku }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { requestId } = getRequestContext(req.headers)
  const log = createLogger({ requestId })

  const payload = await getPayload({ config })

  const rawText = await req.text()
  let body: NowPaymentsBody

  try {
    body = JSON.parse(rawText) as NowPaymentsBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const paymentId = String(body.payment_id ?? '')
  const payCurrency = (body.pay_currency as string | undefined) ?? 'crypto'
  const provider = `nowpayments-${payCurrency.toLowerCase()}`

  const providerEventId = paymentId
    ? `nowpayments-${paymentId}`
    : `nowpayments-${Date.now()}-${crypto.randomUUID()}`

  log.info({ msg: 'webhook.nowpayments.received', eventType: body.payment_status, providerEventId })

  // -------------------------------------------------------------------------
  // Step 1 — Save raw webhook first (idempotency gate)
  // -------------------------------------------------------------------------
  let webhookRow: { id: string | number }

  try {
    webhookRow = (await payload.create({
      collection: 'payment-webhooks',
      data: {
        provider,
        eventType: body.payment_status ?? 'unknown',
        providerEventId,
        payload: body,
        signature: req.headers.get('x-nowpayments-sig') ?? '',
        receivedAt: new Date().toISOString(),
        retryCount: 0,
      },
      overrideAccess: true,
    })) as { id: string | number }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      payload.logger.info({ msg: '[nowpayments] duplicate webhook ignored', providerEventId })
      return NextResponse.json({ ok: true })
    }
    payload.logger.error({ msg: '[nowpayments] failed to save raw webhook', err: msg })
    return NextResponse.json({ error: 'Internal error saving webhook' }, { status: 500 })
  }

  // -------------------------------------------------------------------------
  // Step 2 — Verify HMAC-SHA512 signature
  // -------------------------------------------------------------------------
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
  if (ipnSecret) {
    const sig = req.headers.get('x-nowpayments-sig') ?? ''
    if (!sig || !verifyHmac(rawText, sig, ipnSecret)) {
      await payload.update({
        collection: 'payment-webhooks',
        id: webhookRow.id as string,
        data: { processingResult: 'failed', processingError: 'invalid signature' },
        overrideAccess: true,
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — Dispatch by payment_status
  // -------------------------------------------------------------------------
  const status = body.payment_status

  if (status !== 'finished') {
    // confirming / waiting / expired — save raw only
    payload.logger.info({ msg: '[nowpayments] non-finished status, skipping', status })
    await payload.update({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      data: { processingResult: 'skipped', processedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    return NextResponse.json({ ok: true })
  }

  // payment_status === 'finished' — process token pack purchase
  try {
    const orderId = body.order_id ?? ''
    const parsed = parseOrderId(String(orderId))
    if (!parsed) {
      throw new Error(`[nowpayments] cannot parse order_id: ${orderId}`)
    }

    const { userId, packageSku } = parsed

    // Look up token package
    const pkgResult = await payload.find({
      collection: 'token-packages',
      where: { sku: { equals: packageSku }, isActive: { equals: true } },
      limit: 1,
      overrideAccess: true,
    })

    if (pkgResult.docs.length === 0) {
      throw new Error(`[nowpayments] token package not found for sku: ${packageSku}`)
    }

    const pkg = pkgResult.docs[0]!
    const tokenAmount = (pkg.tokenAmount as number) ?? 0
    const priceCents = (pkg.priceCents as number) ?? 0
    const now = new Date()

    // Insert payment transaction
    const paymentTx = await payload.create({
      collection: 'payment-transactions',
      data: {
        userId,
        type: 'token_purchase',
        status: 'completed',
        amountCents: priceCents,
        currency: 'USD',
        provider: payCurrency.toLowerCase().startsWith('btc')
          ? 'crypto_btc'
          : payCurrency.toLowerCase().startsWith('eth')
            ? 'crypto_eth'
            : 'crypto_usdt',
        providerTransactionId: `nowpayments-${paymentId}`,
        providerRawData: body,
        tokenPackageId: pkg.id,
        completedAt: now.toISOString(),
      },
      overrideAccess: true,
    })

    // Grant tokens
    await grant(payload, {
      userId,
      type: 'grant_purchase',
      amount: tokenAmount,
      reason: `nowpayments:${paymentId}`,
      relatedPaymentId: paymentTx.id as string,
    })

    await payload.update({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      data: { processedAt: now.toISOString(), processingResult: 'success' },
      overrideAccess: true,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    payload.logger.error({ msg: '[nowpayments] processing error', err: msg })

    const current = await payload.findByID({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      overrideAccess: true,
    })
    const retryCount = ((current as { retryCount?: number }).retryCount ?? 0) + 1

    await payload.update({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      data: { processingResult: 'failed', processingError: msg, retryCount },
      overrideAccess: true,
    })

    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
