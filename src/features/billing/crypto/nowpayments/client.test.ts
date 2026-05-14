import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  isNowpaymentsConfigured,
  nowpaymentsRequest,
  NowpaymentsApiError,
  NowpaymentsConfigError,
} from './client'

const ORIGINAL_ENV = { ...process.env }
const fetchSpy = vi.spyOn(global, 'fetch')

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.NOWPAYMENTS_API_KEY
  delete process.env.NOWPAYMENTS_ENV
  fetchSpy.mockReset()
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('isNowpaymentsConfigured', () => {
  it('returns false when api key is unset', () => {
    expect(isNowpaymentsConfigured()).toBe(false)
  })

  it('returns true when api key is set', () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-key'
    expect(isNowpaymentsConfigured()).toBe(true)
  })
})

describe('nowpaymentsRequest', () => {
  it('throws NowpaymentsConfigError when api key is missing', async () => {
    await expect(
      nowpaymentsRequest({ method: 'POST', path: '/v1/invoice', body: {} }),
    ).rejects.toBeInstanceOf(NowpaymentsConfigError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hits production base url by default', async () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-key'
    fetchSpy.mockResolvedValue(mockJsonResponse({ status: 'OK' }))

    await nowpaymentsRequest({ method: 'GET', path: '/v1/status' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = fetchSpy.mock.calls[0]![0] as string
    expect(url).toBe('https://api.nowpayments.io/v1/status')
  })

  it('hits sandbox base url when NOWPAYMENTS_ENV=sandbox', async () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-key'
    process.env.NOWPAYMENTS_ENV = 'sandbox'
    fetchSpy.mockResolvedValue(mockJsonResponse({ status: 'OK' }))

    await nowpaymentsRequest({ method: 'GET', path: '/v1/status' })

    const url = fetchSpy.mock.calls[0]![0] as string
    expect(url).toBe('https://api-sandbox.nowpayments.io/v1/status')
  })

  it('sends x-api-key header and JSON body', async () => {
    process.env.NOWPAYMENTS_API_KEY = 'secret-key'
    fetchSpy.mockResolvedValue(mockJsonResponse({ ok: true }))

    await nowpaymentsRequest({ method: 'POST', path: '/v1/invoice', body: { foo: 'bar' } })

    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('secret-key')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ foo: 'bar' }))
  })

  it('throws NowpaymentsApiError on non-2xx response', async () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-key'
    fetchSpy.mockResolvedValue(
      new Response('insufficient balance', { status: 400 }),
    )

    let err: unknown
    try {
      await nowpaymentsRequest({ method: 'POST', path: '/v1/invoice', body: {} })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(NowpaymentsApiError)
    expect((err as NowpaymentsApiError).status).toBe(400)
    expect((err as NowpaymentsApiError).responseBody).toContain('insufficient balance')
  })

  it('throws NowpaymentsApiError on invalid JSON response', async () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-key'
    fetchSpy.mockResolvedValue(new Response('<html>down</html>', { status: 200 }))

    await expect(
      nowpaymentsRequest({ method: 'GET', path: '/v1/status' }),
    ).rejects.toBeInstanceOf(NowpaymentsApiError)
  })
})
