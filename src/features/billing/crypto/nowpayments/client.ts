import 'server-only'

// Minimal NOWPayments HTTP client. Lives here so other crypto providers can
// add their own folder under src/features/billing/crypto/<provider>/ without
// taking on shared baggage.
//
// Sandbox vs production split is per the official docs:
//   sandbox    https://api-sandbox.nowpayments.io
//   production https://api.nowpayments.io
// IPN signature verification is handled in the existing webhook route
// (src/app/api/webhooks/nowpayments/route.ts) — this file only deals with
// outbound calls.

const PRODUCTION_BASE = 'https://api.nowpayments.io'
const SANDBOX_BASE = 'https://api-sandbox.nowpayments.io'

export class NowpaymentsApiError extends Error {
  readonly status: number
  readonly responseBody: string

  constructor(status: number, responseBody: string) {
    super(`NOWPayments API error ${status}: ${responseBody.slice(0, 200)}`)
    this.name = 'NowpaymentsApiError'
    this.status = status
    this.responseBody = responseBody
  }
}

export class NowpaymentsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NowpaymentsConfigError'
  }
}

/** True when the API key is wired — UI/actions use this to surface mock mode. */
export function isNowpaymentsConfigured(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY
}

function getBaseUrl(): string {
  // 'production' is the default so a forgotten env var on a real Vercel deploy
  // doesn't silently hit sandbox and accept fake payments. Sandbox must be
  // explicitly opted into.
  return process.env.NOWPAYMENTS_ENV === 'sandbox' ? SANDBOX_BASE : PRODUCTION_BASE
}

type Json = Record<string, unknown> | unknown[]

/**
 * Low-level wrapper. POST/GET to NOWPayments with the configured API key.
 * Caller is expected to provide typed wrappers (createInvoice, etc.) on top.
 */
export async function nowpaymentsRequest<T>(opts: {
  method: 'GET' | 'POST'
  path: string
  body?: Json
}): Promise<T> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY
  if (!apiKey) {
    throw new NowpaymentsConfigError(
      'NOWPAYMENTS_API_KEY is not set — cannot call the NOWPayments API. ' +
        'Use isNowpaymentsConfigured() to gate calls and fall back to mock mode.',
    )
  }

  const url = `${getBaseUrl()}${opts.path}`
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    // NOWPayments rate-limits aggressively at ~120 rpm. We have a single
    // server caller per checkout-initiation, so default fetch behaviour is OK.
  })

  const text = await res.text()
  if (!res.ok) {
    throw new NowpaymentsApiError(res.status, text)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new NowpaymentsApiError(res.status, `non-JSON response: ${text.slice(0, 200)}`)
  }
}
