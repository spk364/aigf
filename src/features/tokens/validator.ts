// TODO(phase-2-task-7): schedule via Inngest cron every hour
import type { BasePayload } from 'payload'
import { logger } from '@/shared/lib/logger'

type Discrepancy = {
  userId: string | number
  cached: number
  expected: number
}

export async function validateBalances(
  payload: BasePayload,
): Promise<{ ok: boolean; discrepancies: Discrepancy[] }> {
  const discrepancies: Discrepancy[] = []

  const balancesResult = await payload.find({
    collection: 'token-balances',
    limit: 1000,
    overrideAccess: true,
  })

  for (const row of balancesResult.docs) {
    const userId = typeof row.userId === 'object' && row.userId !== null
      ? (row.userId as { id: string | number }).id
      : (row.userId as string | number)

    const cached = (row.balance as number) ?? 0

    // Fetch all transactions for this user and sum in Node (MVP — no group-by)
    let page = 1
    let sum = 0
    let hasMore = true

    while (hasMore) {
      const txResult = await payload.find({
        collection: 'token-transactions',
        where: { userId: { equals: userId } },
        limit: 500,
        page,
        overrideAccess: true,
      })

      for (const tx of txResult.docs) {
        sum += (tx.amount as number) ?? 0
      }

      hasMore = txResult.hasNextPage
      page += 1
    }

    const expected = sum

    if (cached !== expected) {
      discrepancies.push({ userId, cached, expected })
      logger.warn({ msg: 'token_balance_discrepancy', userId, cached, expected })
    }
  }

  return { ok: discrepancies.length === 0, discrepancies }
}
