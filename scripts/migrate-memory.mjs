// Applies the memory migration Payload doesn't manage (pgvector types):
// migrations/0012_memory_v2.sql — memory_profiles table, embedding → halfvec(512).
// It supersedes 0001_memory_embeddings.sql, which must NOT be re-run afterwards
// (its HNSW index uses vector_cosine_ops and fails on the halfvec column).
// Run AFTER `pnpm payload:migrate` has created the memory_entries table.
// Idempotent, so re-running is safe.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const FILES = ['0012_memory_v2.sql']

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
for (const file of FILES) {
  await c.query(readFileSync(path.join(__dirname, '../migrations', file), 'utf8'))
  console.log(`✓ ${file} applied`)
}
await c.end()
