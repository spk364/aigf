// Only grant/spend/refundByAdmin should write to token_balances
import type { BasePayload } from 'payload'

export type GrantType =
  | 'grant_subscription'
  | 'grant_subscription_upfront'
  | 'grant_purchase'
  | 'grant_bonus'
  | 'grant_promo'
  | 'grant_referral'
  | 'refund'
  | 'safety_refund'
  | 'tech_refund'
  | 'admin_adjustment'

export type AutoRefundType = 'safety_refund' | 'tech_refund'
export type SpendType =
  | 'spend_image'
  | 'spend_image_premium'
  | 'spend_image_regen'
  | 'spend_video'
  | 'spend_video_regen'
  | 'spend_voice_message'
  | 'spend_voice_call'
  | 'spend_advanced_llm'

type TokenTransaction = {
  id: string | number
  userId: string | number
  type: string
  amount: number
  balanceAfter: number
  idempotencyKey?: string | null
  reason?: string | null
  relatedPaymentId?: string | number | null
  relatedMessageId?: string | number | null
  adminUserId?: string | number | null
}

/**
 * Looks up an existing ledger row by idempotency key.
 * Used to make grant/spend/refund safe under retry — webhook redelivery,
 * Inngest re-runs, fal.ai callback storms.
 */
async function findByIdempotencyKey(
  payload: BasePayload,
  idempotencyKey: string,
  txId?: string | number | null,
): Promise<TokenTransaction | null> {
  const result = await payload.find({
    collection: 'token-transactions',
    where: { idempotencyKey: { equals: idempotencyKey } },
    limit: 1,
    overrideAccess: true,
    ...(txId ? { req: { transactionID: txId } as never } : {}),
  })
  const row = result.docs[0]
  return row ? (row as unknown as TokenTransaction) : null
}

export async function getBalance(payload: BasePayload, userId: string | number): Promise<number> {
  const result = await payload.find({
    collection: 'token-balances',
    where: { userId: { equals: userId } },
    limit: 1,
    overrideAccess: true,
  })

  const row = result.docs[0]
  if (!row) return 0
  return (row.balance as number) ?? 0
}

export async function ensureBalanceRow(
  payload: BasePayload,
  userId: string | number,
  txId?: string | number | null,
): Promise<void> {
  const existing = await payload.find({
    collection: 'token-balances',
    where: { userId: { equals: userId } },
    limit: 1,
    overrideAccess: true,
    ...(txId ? { req: { transactionID: txId } as never } : {}),
  })

  if (existing.docs.length > 0) return

  await payload.create({
    collection: 'token-balances',
    data: { userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
    overrideAccess: true,
    ...(txId ? { req: { transactionID: txId } as never } : {}),
  })
}

export async function grant(
  payload: BasePayload,
  opts: {
    userId: string | number
    type: GrantType
    amount: number
    reason?: string
    relatedPaymentId?: string | number
    idempotencyKey?: string
  },
): Promise<TokenTransaction> {
  if (opts.amount <= 0) throw new Error('grant amount must be positive')

  // Pre-check (cheap, non-locking) — if the same key already grant-ed, short-circuit.
  // The UNIQUE index is the source of truth for race correctness; this is just to avoid
  // a noisy rollback in the common retry path.
  if (opts.idempotencyKey) {
    const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
    if (existing) return existing
  }

  const txId = await payload.db.beginTransaction()

  try {
    await ensureBalanceRow(payload, opts.userId, txId)

    const balResult = await payload.find({
      collection: 'token-balances',
      where: { userId: { equals: opts.userId } },
      limit: 1,
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    const balRow = balResult.docs[0]!
    const current = (balRow.balance as number) ?? 0
    const lifetimeEarned = (balRow.lifetimeEarned as number) ?? 0
    const newBalance = current + opts.amount

    // INSERT ledger row first (atomicity invariant: ledger before balance)
    const tx = await payload.create({
      collection: 'token-transactions',
      data: {
        userId: opts.userId,
        type: opts.type,
        amount: opts.amount,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey ?? null,
        reason: opts.reason ?? null,
        relatedPaymentId: opts.relatedPaymentId ?? null,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    await payload.update({
      collection: 'token-balances',
      id: balRow.id as string,
      data: {
        balance: newBalance,
        lifetimeEarned: lifetimeEarned + opts.amount,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    if (txId) await payload.db.commitTransaction(txId)

    return tx as unknown as TokenTransaction
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)

    // Race: a concurrent retry committed the same idempotencyKey first.
    // Re-read and return that row instead of failing the caller.
    if (opts.idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
      if (existing) return existing
    }
    throw err
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  return e.code === '23505' || (typeof e.message === 'string' && e.message.includes('duplicate key'))
}

export async function spend(
  payload: BasePayload,
  opts: {
    userId: string | number
    type: SpendType
    amount: number
    relatedMessageId?: string | number
    reason?: string
    idempotencyKey?: string
  },
): Promise<{ ok: true; balanceAfter: number; replayed?: boolean } | { ok: false; reason: 'insufficient' }> {
  if (opts.amount <= 0) throw new Error('spend amount must be positive')

  // Pre-check: same idempotencyKey already debited — replay the result.
  if (opts.idempotencyKey) {
    const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
    if (existing) {
      return { ok: true, balanceAfter: existing.balanceAfter, replayed: true }
    }
  }

  const txId = await payload.db.beginTransaction()

  try {
    const balResult = await payload.find({
      collection: 'token-balances',
      where: { userId: { equals: opts.userId } },
      limit: 1,
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    const balRow = balResult.docs[0]
    const current = balRow ? ((balRow.balance as number) ?? 0) : 0

    if (current < opts.amount) {
      if (txId) await payload.db.rollbackTransaction(txId)
      return { ok: false, reason: 'insufficient' }
    }

    const lifetimeSpent = balRow ? ((balRow.lifetimeSpent as number) ?? 0) : 0
    const newBalance = current - opts.amount

    // INSERT ledger row first (atomicity invariant: ledger before balance)
    await payload.create({
      collection: 'token-transactions',
      data: {
        userId: opts.userId,
        type: opts.type,
        amount: -opts.amount,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey ?? null,
        reason: opts.reason ?? null,
        relatedMessageId: opts.relatedMessageId ?? null,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    await payload.update({
      collection: 'token-balances',
      id: balRow!.id as string,
      data: {
        balance: newBalance,
        lifetimeSpent: lifetimeSpent + opts.amount,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    if (txId) await payload.db.commitTransaction(txId)

    return { ok: true, balanceAfter: newBalance }
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)

    if (opts.idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
      if (existing) return { ok: true, balanceAfter: existing.balanceAfter, replayed: true }
    }
    throw err
  }
}

export async function refundByAdmin(
  payload: BasePayload,
  adminUserId: string | number,
  opts: {
    userId: string | number
    amount: number
    reason: string
    relatedMessageId?: string | number
    idempotencyKey?: string
  },
): Promise<TokenTransaction> {
  if (opts.amount <= 0) throw new Error('refund amount must be positive')

  if (opts.idempotencyKey) {
    const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
    if (existing) return existing
  }

  const txId = await payload.db.beginTransaction()

  try {
    await ensureBalanceRow(payload, opts.userId, txId)

    const balResult = await payload.find({
      collection: 'token-balances',
      where: { userId: { equals: opts.userId } },
      limit: 1,
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    const balRow = balResult.docs[0]!
    const current = (balRow.balance as number) ?? 0
    const lifetimeEarned = (balRow.lifetimeEarned as number) ?? 0
    const newBalance = current + opts.amount

    const tx = await payload.create({
      collection: 'token-transactions',
      data: {
        userId: opts.userId,
        type: 'refund',
        amount: opts.amount,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey ?? null,
        reason: opts.reason,
        relatedMessageId: opts.relatedMessageId ?? null,
        adminUserId,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    await payload.update({
      collection: 'token-balances',
      id: balRow.id as string,
      data: {
        balance: newBalance,
        lifetimeEarned: lifetimeEarned + opts.amount,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    if (txId) await payload.db.commitTransaction(txId)

    return tx as unknown as TokenTransaction
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)

    if (opts.idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
      if (existing) return existing
    }
    throw err
  }
}

/**
 * System-driven refund. Two flavours, kept as separate transaction types so we
 * can split metrics:
 *   - safety_refund: NSFW classifier flagged a generated asset post-spend.
 *   - tech_refund:   provider failure (fal.ai timeout, R2 persist failure, etc.).
 *
 * idempotencyKey is required because every caller is in a retry-prone path
 * (chat stream, Inngest job). Distinct keys per (messageId, refund-flavour) so
 * a tech_refund and a later safety_refund on the same message can both land.
 */
export async function autoRefund(
  payload: BasePayload,
  opts: {
    userId: string | number
    type: AutoRefundType
    amount: number
    reason: string
    relatedMessageId?: string | number
    idempotencyKey: string
  },
): Promise<TokenTransaction> {
  if (opts.amount <= 0) throw new Error('refund amount must be positive')

  const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
  if (existing) return existing

  const txId = await payload.db.beginTransaction()

  try {
    await ensureBalanceRow(payload, opts.userId, txId)

    const balResult = await payload.find({
      collection: 'token-balances',
      where: { userId: { equals: opts.userId } },
      limit: 1,
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    const balRow = balResult.docs[0]!
    const current = (balRow.balance as number) ?? 0
    const lifetimeEarned = (balRow.lifetimeEarned as number) ?? 0
    const newBalance = current + opts.amount

    const tx = await payload.create({
      collection: 'token-transactions',
      data: {
        userId: opts.userId,
        type: opts.type,
        amount: opts.amount,
        balanceAfter: newBalance,
        idempotencyKey: opts.idempotencyKey,
        reason: opts.reason,
        relatedMessageId: opts.relatedMessageId ?? null,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    await payload.update({
      collection: 'token-balances',
      id: balRow.id as string,
      data: {
        balance: newBalance,
        lifetimeEarned: lifetimeEarned + opts.amount,
      },
      overrideAccess: true,
      req: { transactionID: txId } as never,
    })

    if (txId) await payload.db.commitTransaction(txId)

    return tx as unknown as TokenTransaction
  } catch (err) {
    if (txId) await payload.db.rollbackTransaction(txId)

    if (isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(payload, opts.idempotencyKey)
      if (existing) return existing
    }
    throw err
  }
}
