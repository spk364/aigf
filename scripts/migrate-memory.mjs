// Applies migrations/0001_memory_embeddings.sql (vector column + HNSW index).
// Run AFTER `pnpm payload:migrate` has created the memory_entries table.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const sql = readFileSync(path.join(__dirname, '../migrations/0001_memory_embeddings.sql'), 'utf8')

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(sql)
console.log('✓ memory_entries embedding column + HNSW index applied')
await c.end()
