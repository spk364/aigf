import type { BasePayload } from 'payload'

/**
 * In-memory mock of just enough of Payload's BasePayload to drive ledger.ts
 * tests. Models the two collections involved (`token-balances`,
 * `token-transactions`) and enforces UNIQUE on idempotencyKey so we can
 * exercise the race-replay branch of grant/spend/autoRefund.
 *
 * Transactions are tracked by id but isolation is not real — we accept the
 * trade-off because the production atomicity guarantee comes from Postgres,
 * not from these tests. What we do verify here is the application-level
 * contract: idempotency replays, insufficient-balance refusal, refund flows.
 */

type Row = Record<string, unknown> & { id: number }

type Store = {
  'token-balances': Row[]
  'token-transactions': Row[]
}

type WhereClause = Record<string, { equals: unknown }>

function matchesWhere(row: Row, where: WhereClause | undefined): boolean {
  if (!where) return true
  for (const [field, cond] of Object.entries(where)) {
    if (row[field] !== cond.equals) return false
  }
  return true
}

export type MockPayload = BasePayload & {
  /** Test introspection — read-only access to the store. */
  __store: Store
  /**
   * Force the next call to `create` on a collection to throw a unique-violation.
   * Optional `beforeThrow` runs first — used to inject the "winning" row so the
   * caller's post-rollback recovery path can find it.
   */
  __failNextCreateOnce: (collection: keyof Store, beforeThrow?: () => void) => void
}

export function createMockPayload(): MockPayload {
  const store: Store = {
    'token-balances': [],
    'token-transactions': [],
  }
  const idCounter: Record<string, number> = {
    'token-balances': 0,
    'token-transactions': 0,
  }
  const forceFailNextCreate: Partial<Record<keyof Store, { beforeThrow?: () => void }>> = {}

  const uniqueViolation = (): Error => {
    const err = new Error('duplicate key value violates unique constraint') as Error & {
      code?: string
    }
    err.code = '23505'
    return err
  }

  const mock: Partial<MockPayload> = {
    __store: store,
    __failNextCreateOnce(collection, beforeThrow) {
      forceFailNextCreate[collection] = { beforeThrow }
    },
    db: {
      // Real Payload returns a tx id; the ledger code threads it through but
      // doesn't depend on its value, so a sentinel is fine.
      beginTransaction: async () => 'tx-1' as unknown as string,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      // Cast — Payload's DB adapter type is huge and most of it is unused here.
    } as unknown as BasePayload['db'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    find: (async (args: any) => {
      const rows = store[args.collection as keyof Store] ?? []
      const docs = rows.filter((r) => matchesWhere(r, args.where))
      return { docs: docs.slice(0, args.limit ?? 10), totalDocs: docs.length, hasNextPage: false }
    }) as unknown as BasePayload['find'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (async (args: any) => {
      const collection = args.collection as keyof Store
      const fail = forceFailNextCreate[collection]
      if (fail) {
        delete forceFailNextCreate[collection]
        fail.beforeThrow?.()
        throw uniqueViolation()
      }

      // Enforce UNIQUE on token-transactions.idempotencyKey
      if (collection === 'token-transactions') {
        const key = (args.data as { idempotencyKey?: string | null }).idempotencyKey
        if (key) {
          const existing = store['token-transactions'].find((r) => r.idempotencyKey === key)
          if (existing) throw uniqueViolation()
        }
      }

      idCounter[collection] = (idCounter[collection] ?? 0) + 1
      const row: Row = { id: idCounter[collection]!, ...args.data }
      store[collection].push(row)

      return row as never
    }) as unknown as BasePayload['create'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (async (args: any) => {
      const rows = store[args.collection as keyof Store]
      const target = rows.find((r) => String(r.id) === String(args.id))
      if (!target) throw new Error(`mock update: row not found in ${args.collection}`)
      Object.assign(target, args.data)
      return target as never
    }) as unknown as BasePayload['update'],
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as BasePayload['logger'],
  }

  return mock as MockPayload
}
