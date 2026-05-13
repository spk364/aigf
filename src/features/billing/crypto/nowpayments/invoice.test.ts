import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { buildTokenPackOrderId, createTokenPackInvoice } from './invoice'

const ORIGINAL_ENV = { ...process.env }
const fetchSpy = vi.spyOn(global, 'fetch')

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  process.env.NOWPAYMENTS_API_KEY = 'test-key'
  delete process.env.NOWPAYMENTS_ENV
  fetchSpy.mockReset()
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('buildTokenPackOrderId', () => {
  it('produces id matching webhook parser format', () => {
    const id = buildTokenPackOrderId('user-42', 'tokens_300')
    // Format: tokens_{userId}_{sku}_{nonce} — sku contains underscores
    expect(id).toMatch(/^tokens_user-42_tokens_300_[0-9a-f]{8}$/)
  })

  it('handles numeric userId', () => {
    const id = buildTokenPackOrderId(7, 'tokens_100')
    expect(id).toMatch(/^tokens_7_tokens_100_[0-9a-f]{8}$/)
  })

  it('generates a fresh nonce each call', () => {
    const a = buildTokenPackOrderId('u', 's')
    const b = buildTokenPackOrderId('u', 's')
    expect(a).not.toBe(b)
  })
})

describe('createTokenPackInvoice', () => {
  it('posts the expected body to /v1/invoice and returns invoiceUrl', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'invoice-42',
          order_id: 'tokens_u1_tokens_100_deadbeef',
          invoice_url: 'https://nowpayments.io/invoice/invoice-42',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await createTokenPackInvoice({
      userId: 'u1',
      sku: 'tokens_100',
      priceCents: 499,
      locale: 'en',
      ipnCallbackUrl: 'https://app.example.com/api/webhooks/nowpayments',
      successUrl: 'https://app.example.com/en/billing/return',
      cancelUrl: 'https://app.example.com/en/tokens',
    })

    expect(result.invoiceId).toBe('invoice-42')
    expect(result.invoiceUrl).toBe('https://nowpayments.io/invoice/invoice-42')
    expect(result.orderId).toBe('tokens_u1_tokens_100_deadbeef')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.price_amount).toBe(4.99)
    expect(body.price_currency).toBe('usd')
    expect(body.ipn_callback_url).toBe('https://app.example.com/api/webhooks/nowpayments')
    expect(body.success_url).toBe('https://app.example.com/en/billing/return')
    expect(body.cancel_url).toBe('https://app.example.com/en/tokens')
    expect(body.is_fixed_rate).toBe(true)
    expect(body.is_fee_paid_by_user).toBe(false)
    // order_id must look parseable by the webhook handler
    expect(body.order_id).toMatch(/^tokens_u1_tokens_100_[0-9a-f]{8}$/)
  })

  it('rounds cents → dollars with 2 decimals (no float drift)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'i',
          order_id: 'o',
          invoice_url: 'https://x/i',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await createTokenPackInvoice({
      userId: 1,
      sku: 'tokens_3000',
      priceCents: 12999,
      locale: 'en',
      ipnCallbackUrl: 'https://x',
      successUrl: 'https://x',
      cancelUrl: 'https://x',
    })

    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    ) as { price_amount: number }
    expect(body.price_amount).toBe(129.99)
  })
})
