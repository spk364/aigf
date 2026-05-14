import 'server-only'
import { randomBytes } from 'crypto'
import { nowpaymentsRequest, NowpaymentsConfigError } from './client'

// Invoice creation — hosted-page flow.
//
// Why invoice rather than /v1/payment: invoice produces a hosted URL where
// the user picks their coin themselves. Letting NOWPayments handle coin
// selection means we don't pre-commit to a `pay_currency` server-side, so
// the same code path works for BTC, ETH, USDT-TRC20, etc. without UI work.
//
// order_id format matches the existing webhook parser at
// src/app/api/webhooks/nowpayments/route.ts:35 — keep them in sync.

export type CreateInvoiceInput = {
  userId: string | number
  sku: string
  priceCents: number
  locale: string
  /**
   * Absolute IPN callback URL — must be reachable from NOWPayments servers.
   * For preview deploys, pass the branch URL; for prod, the canonical app URL.
   */
  ipnCallbackUrl: string
  /** Where NOWPayments sends the user after a successful payment. */
  successUrl: string
  /** Where NOWPayments sends the user if they bail mid-flow. */
  cancelUrl: string
}

export type CreateInvoiceResult = {
  invoiceId: string
  orderId: string
  invoiceUrl: string
}

type RawInvoiceResponse = {
  id: string | number
  order_id: string
  invoice_url: string
}

/**
 * Build the order_id we hand to NOWPayments. The webhook parser splits on
 * underscore, so userId/sku must not contain leading or trailing whitespace.
 * Nonce is 8 hex chars — collision-free in practice and short enough that
 * the whole id stays under NOWPayments' 100-char limit for any reasonable sku.
 */
export function buildTokenPackOrderId(userId: string | number, sku: string): string {
  const nonce = randomBytes(4).toString('hex')
  return `tokens_${userId}_${sku}_${nonce}`
}

export async function createTokenPackInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const orderId = buildTokenPackOrderId(input.userId, input.sku)
  const priceAmount = input.priceCents / 100

  const body = {
    price_amount: priceAmount,
    price_currency: 'usd',
    order_id: orderId,
    // Surfaced on the NOWPayments-hosted invoice page; localising fully is
    // beyond scope — English short copy is the safest default while we wait
    // on a translator pass.
    order_description: `${input.sku} token pack`,
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Lock the USD price for 20 minutes so the user doesn't end up paying
    // a different crypto amount than they were quoted at click time.
    is_fixed_rate: true,
    // Fee is paid by us out of the gross price (default) — flipping this to
    // true would mean the user pays $X + crypto network fee, which surprises
    // them mid-checkout. Keep our standard behaviour.
    is_fee_paid_by_user: false,
  }

  const response = await nowpaymentsRequest<RawInvoiceResponse>({
    method: 'POST',
    path: '/v1/invoice',
    body,
  })

  if (!response.invoice_url) {
    throw new NowpaymentsConfigError(
      `NOWPayments returned an invoice without invoice_url: ${JSON.stringify(response)}`,
    )
  }

  return {
    invoiceId: String(response.id),
    orderId: response.order_id,
    invoiceUrl: response.invoice_url,
  }
}
