// The pg-compatible pool behind Payload, for the queries Payload's API can't
// express (vectors, column-to-column comparisons, multi-statement transactions).
//
// Do NOT read `payload.db.pool`. We run on vercelPostgresAdapter, which leaves
// `pool` undefined and hands its VercelPool to drizzle instead — every
// `payload.db.pool` caller silently got undefined in prod: vector retrieval
// returned nothing, embeddings were never written, and "clear history" 500'd.
// The adapter's pool lives on `drizzle.$client`; `pool` is only checked first
// so a switch to the plain postgres adapter keeps working.
//
// tests/integration/sql-pool.test.ts pins this against the real adapter.
import type { BasePayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'

export type SqlPool = PostgresAdapter['pool']

export function getSqlPool(payload: BasePayload): SqlPool | null {
  const db = payload.db as unknown as { pool?: SqlPool; drizzle?: { $client?: SqlPool } }
  return db.pool ?? db.drizzle?.$client ?? null
}
