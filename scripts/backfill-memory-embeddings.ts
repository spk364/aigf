// Backfill embeddings for memory_entries rows written while OPENAI_API_KEY was
// unset. Those rows have `embedding IS NULL`, and retrieve-memories.ts filters
// the vector branch on `embedding IS NOT NULL` — so the moment the key is added,
// every pre-existing memory becomes invisible to retrieval. This script closes
// that gap.
//
//   pnpm backfill:memory-embeddings [--limit N] [--dry-run]
//   node node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env.local scripts/backfill-memory-embeddings.ts
//
// Idempotent: only touches rows where embedding IS NULL AND deleted_at IS NULL,
// so re-running after a partial failure resumes where it stopped.
// Requires DATABASE_URL + OPENAI_API_KEY.

// @ts-expect-error — pg resolved by deep pnpm path (no bundled types there).
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'
import { getEmbedding, toVectorLiteral, EMBEDDING_MODEL } from '../src/shared/ai/embeddings'

// text-embedding-3-small allows generous throughput, but a backfill is bursty
// and unattended — pace it so a large table can't trip a rate limit mid-run.
const DELAY_MS = 120

type Row = { id: number; content: string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY missing — embeddings cannot be generated. Add it before running the backfill.',
    )
  }
  const dryRun = process.argv.includes('--dry-run')
  const limit = Number(arg('--limit') ?? 5000)

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  // Fail loudly if the vector column was never created — otherwise the UPDATE
  // below throws once per row and the run looks like a total failure.
  const col = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'memory_entries' AND column_name = 'embedding'`,
  )
  if (col.rowCount === 0) {
    await client.end()
    throw new Error(
      'memory_entries.embedding does not exist — run `pnpm migrate:memory` first.',
    )
  }

  const { rows } = await client.query<Row>(
    `SELECT id, content
     FROM memory_entries
     WHERE embedding IS NULL AND deleted_at IS NULL
     ORDER BY id
     LIMIT $1`,
    [limit],
  )

  console.log(`${rows.length} memory rows need an embedding${dryRun ? ' (dry run — nothing written)' : ''}`)
  if (rows.length === 0 || dryRun) {
    await client.end()
    return
  }

  let done = 0
  let failed = 0
  for (const row of rows) {
    try {
      const embedding = await getEmbedding(row.content)
      if (!embedding) {
        failed++
        console.warn(`  id=${row.id}: embedding returned null`)
        continue
      }
      await client.query(
        `UPDATE memory_entries SET embedding = $1::vector, embedding_model = $2 WHERE id = $3`,
        [toVectorLiteral(embedding), EMBEDDING_MODEL, row.id],
      )
      done++
      if (done % 25 === 0) console.log(`  ${done}/${rows.length}…`)
    } catch (err) {
      failed++
      console.warn(`  id=${row.id}: ${(err as Error).message.slice(0, 120)}`)
    }
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  const remaining = await client.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM memory_entries WHERE embedding IS NULL AND deleted_at IS NULL`,
  )
  console.log(`\nembedded ${done}, failed ${failed}, still without an embedding: ${remaining.rows[0]?.n ?? '?'}`)
  await client.end()
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
