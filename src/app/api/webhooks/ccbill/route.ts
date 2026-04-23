// TODO(phase-2-task-7): extract heavy processing to an Inngest background job;
// webhook handler should only save raw + trigger job.

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  handleNewSaleSuccess,
  handleRenewalSuccess,
  handleCancellation,
  handleExpiration,
  handleRefund,
  handleChargeback,
  type CcbillWebhookPayload,
} from '@/features/billing/ccbill/handlers'
import { getRequestContext } from '@/shared/lib/request-context'
import { createLogger } from '@/shared/lib/logger'

function parseFormEncoded(body: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of body.split('&')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const key = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' '))
    const value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '))
    result[key] = value
  }
  return result
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { requestId } = getRequestContext(req.headers)
  const log = createLogger({ requestId })

  const payload = await getPayload({ config })

  // -------------------------------------------------------------------------
  // Parse body — support both form-encoded (CCBill default) and JSON
  // -------------------------------------------------------------------------
  let body: CcbillWebhookPayload

  const contentType = req.headers.get('content-type') ?? ''
  const rawText = await req.text()

  if (contentType.includes('application/json')) {
    try {
      body = JSON.parse(rawText) as CcbillWebhookPayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  } else {
    // application/x-www-form-urlencoded (CCBill default)
    body = parseFormEncoded(rawText)
  }

  const eventType = (body.eventType as string | undefined) ?? 'unknown'
  const providerEventId =
    (body.transactionId as string | undefined) ??
    (body.subscriptionId as string | undefined) ??
    `ccbill-${Date.now()}-${crypto.randomUUID()}`

  log.info({ msg: 'webhook.ccbill.received', eventType, providerEventId })

  // -------------------------------------------------------------------------
  // Step 1 — Save raw webhook first (idempotency gate)
  // -------------------------------------------------------------------------
  let webhookRow: { id: string | number }

  try {
    webhookRow = (await payload.create({
      collection: 'payment-webhooks',
      data: {
        provider: 'ccbill',
        eventType,
        providerEventId,
        payload: body,
        signature: (body.signature as string | undefined) ?? '',
        receivedAt: new Date().toISOString(),
        retryCount: 0,
      },
      overrideAccess: true,
    })) as { id: string | number }
  } catch (err: unknown) {
    // Unique constraint violation on providerEventId → duplicate webhook
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      payload.logger.info({ msg: '[ccbill] duplicate webhook ignored', providerEventId })
      return NextResponse.json({ ok: true })
    }
    payload.logger.error({ msg: '[ccbill] failed to save raw webhook', err: msg })
    return NextResponse.json({ error: 'Internal error saving webhook' }, { status: 500 })
  }

  // -------------------------------------------------------------------------
  // Step 2 — Verify signature (sandbox: shared-secret header check)
  // TODO(prod): Replace with real CCBill MD5 digest verification.
  // Real verification: md5(initialPrice + initialPeriod + currencyCode + salt)
  // -------------------------------------------------------------------------
  const secret = process.env.CCBILL_WEBHOOK_SECRET
  if (secret) {
    const incomingSecret = req.headers.get('x-ccbill-webhook-secret')
    if (incomingSecret !== secret) {
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
  // Step 3 — Dispatch by eventType
  // -------------------------------------------------------------------------
  try {
    switch (eventType) {
      case 'NewSaleSuccess':
        await handleNewSaleSuccess(payload, body)
        break
      case 'RenewalSuccess':
        await handleRenewalSuccess(payload, body)
        break
      case 'Cancellation':
        await handleCancellation(payload, body)
        break
      case 'Expiration':
        await handleExpiration(payload, body)
        break
      case 'Refund':
        await handleRefund(payload, body)
        break
      case 'Chargeback':
        await handleChargeback(payload, body)
        break
      default:
        // Unknown event — skip gracefully
        payload.logger.warn({ msg: '[ccbill] unknown eventType', eventType })
        await payload.update({
          collection: 'payment-webhooks',
          id: webhookRow.id as string,
          data: { processingResult: 'skipped', processedAt: new Date().toISOString() },
          overrideAccess: true,
        })
        return NextResponse.json({ ok: true })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    payload.logger.error({ msg: '[ccbill] dispatch error', eventType, err: msg })

    // Fetch current retryCount to increment
    const current = await payload.findByID({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      overrideAccess: true,
    })
    const retryCount = ((current as { retryCount?: number }).retryCount ?? 0) + 1

    await payload.update({
      collection: 'payment-webhooks',
      id: webhookRow.id as string,
      data: {
        processingResult: 'failed',
        processingError: msg,
        retryCount,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }

  // -------------------------------------------------------------------------
  // Step 4 — Mark success
  // -------------------------------------------------------------------------
  await payload.update({
    collection: 'payment-webhooks',
    id: webhookRow.id as string,
    data: {
      processedAt: new Date().toISOString(),
      processingResult: 'success',
    },
    overrideAccess: true,
  })

  return NextResponse.json({ ok: true })
}
