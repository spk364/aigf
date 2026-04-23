import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'
const { Client } = pg

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('CREATE EXTENSION IF NOT EXISTS vector')
const r = await c.query(`SELECT extname, extversion FROM pg_extension WHERE extname='vector'`)
console.log('pgvector:', r.rows[0])
await c.end()
