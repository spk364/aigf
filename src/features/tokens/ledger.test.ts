import { describe, it, expect } from 'vitest'
import { autoRefund, getBalance, grant, spend } from './ledger'
import { createMockPayload } from './__mocks__/mock-payload'

const USER = 42

describe('ledger.grant', () => {
  it('credits balance and writes a ledger row', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 100 })

    expect(await getBalance(payload, USER)).toBe(100)
    expect(payload.__store['token-transactions'].length).toBe(1)
  })

  it('replays the existing tx when called twice with the same idempotencyKey', async () => {
    const payload = createMockPayload()
    const opts = {
      userId: USER,
      type: 'grant_subscription' as const,
      amount: 100,
      idempotencyKey: 'ccbill:newsale:abc',
    }

    const first = await grant(payload, opts)
    const second = await grant(payload, opts)

    expect(second.id).toBe(first.id)
    expect(await getBalance(payload, USER)).toBe(100) // not 200
    expect(payload.__store['token-transactions'].length).toBe(1)
  })

  it('handles a race where the unique-key insert is the one that detects the dup', async () => {
    // Simulate the race: pre-check finds nothing (we let it pass), but the
    // INSERT collides because a concurrent transaction committed the same
    // idempotencyKey while we were mid-flight. The mock fires beforeThrow()
    // to inject the "winning" row into the store, then throws 23505 — so the
    // post-rollback lookup inside grant() finds it and replays.
    const payload = createMockPayload()
    const key = 'race-key-1'

    payload.__failNextCreateOnce('token-transactions', () => {
      payload.__store['token-transactions'].push({
        id: 9999,
        userId: USER,
        type: 'grant_purchase',
        amount: 50,
        balanceAfter: 50,
        idempotencyKey: key,
      })
    })

    const tx = await grant(payload, {
      userId: USER,
      type: 'grant_purchase',
      amount: 50,
      idempotencyKey: key,
    })

    expect(tx.id).toBe(9999)
  })

  it('rejects non-positive amounts', async () => {
    const payload = createMockPayload()
    await expect(
      grant(payload, { userId: USER, type: 'grant_purchase', amount: 0 }),
    ).rejects.toThrow(/positive/)
  })
})

describe('ledger.spend', () => {
  it('debits balance when sufficient', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 10 })

    const result = await spend(payload, { userId: USER, type: 'spend_image', amount: 4 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.balanceAfter).toBe(6)
    expect(await getBalance(payload, USER)).toBe(6)
  })

  it('refuses when balance < amount and writes no ledger row', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 1 })

    const result = await spend(payload, { userId: USER, type: 'spend_image', amount: 4 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('insufficient')
    // Only the grant tx exists; the failed spend wrote nothing.
    expect(payload.__store['token-transactions'].length).toBe(1)
    expect(await getBalance(payload, USER)).toBe(1)
  })

  it('replays a duplicate spend with the same idempotencyKey without re-debiting', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 10 })

    const opts = {
      userId: USER,
      type: 'spend_image' as const,
      amount: 4,
      idempotencyKey: 'image:reserve:msg-1',
    }
    const first = await spend(payload, opts)
    const second = await spend(payload, opts)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(second.replayed).toBe(true)
      expect(second.balanceAfter).toBe(6)
    }
    expect(await getBalance(payload, USER)).toBe(6) // single debit
  })

  it('two concurrent spends: only one debits, the other gets insufficient', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 5 })

    // Sequential because the mock has no real concurrency, but the store
    // mirrors the post-tx state — second call sees the debited balance.
    const a = await spend(payload, { userId: USER, type: 'spend_image', amount: 4 })
    const b = await spend(payload, { userId: USER, type: 'spend_image', amount: 4 })

    expect(a.ok).toBe(true)
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.reason).toBe('insufficient')
    expect(await getBalance(payload, USER)).toBe(1)
  })
})

describe('ledger.autoRefund', () => {
  it('credits balance and tags type=tech_refund', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 10 })
    await spend(payload, { userId: USER, type: 'spend_image', amount: 4 })

    await autoRefund(payload, {
      userId: USER,
      type: 'tech_refund',
      amount: 4,
      reason: 'fal_timeout',
      idempotencyKey: 'image:refund:tech:msg-1',
    })

    expect(await getBalance(payload, USER)).toBe(10) // back to whole

    const refundRow = payload.__store['token-transactions'].find(
      (r) => r.type === 'tech_refund',
    )
    expect(refundRow).toBeDefined()
    expect(refundRow?.amount).toBe(4)
  })

  it('safety_refund and tech_refund on the same message coexist (different keys)', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 10 })

    await autoRefund(payload, {
      userId: USER,
      type: 'tech_refund',
      amount: 2,
      reason: 'a',
      idempotencyKey: 'image:refund:tech:msg-1',
    })
    await autoRefund(payload, {
      userId: USER,
      type: 'safety_refund',
      amount: 2,
      reason: 'b',
      idempotencyKey: 'image:refund:safety:msg-1',
    })

    expect(await getBalance(payload, USER)).toBe(14)
    const types = payload.__store['token-transactions'].map((r) => r.type)
    expect(types).toContain('tech_refund')
    expect(types).toContain('safety_refund')
  })

  it('replays an existing refund when called twice with the same key', async () => {
    const payload = createMockPayload()
    await grant(payload, { userId: USER, type: 'grant_purchase', amount: 10 })

    const opts = {
      userId: USER,
      type: 'safety_refund' as const,
      amount: 4,
      reason: 'flagged',
      idempotencyKey: 'image:refund:safety:msg-1',
    }
    const first = await autoRefund(payload, opts)
    const second = await autoRefund(payload, opts)

    expect(second.id).toBe(first.id)
    expect(await getBalance(payload, USER)).toBe(14) // only credited once
  })
})
