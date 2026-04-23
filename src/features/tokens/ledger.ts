// Only grant/spend/refundByAdmin should write to token_balances
import type { BasePayload } from 'payload'

export type GrantType = 'grant_subscription' | 'grant_purchase' | 'grant_bonus' | 'refund' | 'admin_adjustment'
export type SpendType = 'spend_image' | 'spend_image_premium' | 'spend_image_regen' | 'spend_video' | 'spend_video_regen' | 'spend_advanced_llm'

type TokenTransaction = {
  id: string | number
  userId: string | number
  type: string
  amount: number
  balanceAfter: number
  reason?: string | null
  relatedPaymentId?: string | number | null
  relatedMessageId?: string | number | null
  adminUserId?: string | number | null
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
  },
): Promise<TokenTransaction> {
  if (opts.amount <= 0) throw new Error('grant amount must be positive')

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
    throw err
  }
}

export async function spend(
  payload: BasePayload,
  opts: {
    userId: string | number
    type: SpendType
    amount: number
    relatedMessageId?: string | number
    reason?: string
  },
): Promise<{ ok: true; balanceAfter: number } | { ok: false; reason: 'insufficient' }> {
  if (opts.amount <= 0) throw new Error('spend amount must be positive')

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
  },
): Promise<TokenTransaction> {
  if (opts.amount <= 0) throw new Error('refund amount must be positive')

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
    throw err
  }
}
