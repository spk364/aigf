// Applies migrations/0012_merge_duplicate_conversations.sql — collapses
// duplicate conversations down to one unified thread per (user, character).
// The SQL is idempotent and transactional, so re-running is a safe no-op.
//
// Run AFTER `pnpm payload:migrate` has created the conversations/messages tables.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const sql = readFileSync(
  path.join(__dirname, '../migrations/0012_merge_duplicate_conversations.sql'),
  'utf8',
)

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(sql)
console.log('✓ duplicate conversations merged into one thread per (user, character)')
await c.end()
