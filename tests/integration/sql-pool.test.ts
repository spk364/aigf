// The raw-SQL pool must resolve on the adapter we actually run. Unit tests mock
// payload.db, so a wrong guess about its shape passes them; this boots the real
// Payload config against the real database.
import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload, type BasePayload } from 'payload'
import config from '@payload-config'
import { getSqlPool } from '@/shared/db/sql-pool'

let payload: BasePayload

beforeAll(async () => {
  payload = await getPayload({ config })
})

describe('getSqlPool on the real adapter', () => {
  it('resolves a pool', () => {
    expect(getSqlPool(payload)).not.toBeNull()
  })

  it('runs parameterised queries', async () => {
    const res = await getSqlPool(payload)!.query<{ n: number }>('SELECT $1::int + 1 AS n', [41])
    expect(res.rows[0]?.n).toBe(42)
  })

  it('runs a transaction on a dedicated client', async () => {
    const client = await getSqlPool(payload)!.connect()
    try {
      await client.query('BEGIN')
      await client.query('CREATE TEMP TABLE sql_pool_probe (x int) ON COMMIT DROP')
      await client.query('INSERT INTO sql_pool_probe VALUES (1), (2)')
      const res = await client.query<{ n: string }>('SELECT count(*) AS n FROM sql_pool_probe')
      expect(Number(res.rows[0]?.n)).toBe(2)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })
})
