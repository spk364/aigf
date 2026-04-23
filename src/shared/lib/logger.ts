import pino from 'pino'
import { Writable } from 'stream'

// ---------------------------------------------------------------------------
// Axiom batch transport (only in production when credentials are present)
// ---------------------------------------------------------------------------

function createAxiomStream(token: string, dataset: string): Writable {
  const endpoint = `https://api.axiom.co/v1/datasets/${dataset}/ingest`
  const FLUSH_INTERVAL_MS = 2000
  const FLUSH_SIZE = 50

  const buffer: string[] = []
  let flushTimer: ReturnType<typeof setInterval> | null = null

  async function flush() {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-ndjson',
        },
        body: batch.join('\n'),
      })
    } catch {
      // Drop silently — telemetry must not break the app
    }
  }

  if (flushTimer === null) {
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
    // Allow the process to exit even if the timer is active
    if (flushTimer.unref) flushTimer.unref()
  }

  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffer.push(chunk.toString().trimEnd())
      if (buffer.length >= FLUSH_SIZE) {
        flush().finally(callback)
      } else {
        callback()
      }
    },
    final(callback) {
      flush().finally(callback)
    },
  })
}

// ---------------------------------------------------------------------------
// Build the base Pino instance
// ---------------------------------------------------------------------------

const isProd = process.env.NODE_ENV === 'production'
const axiomToken = process.env.AXIOM_TOKEN
const axiomDataset = process.env.AXIOM_DATASET

let baseLogger: pino.Logger

if (!isProd) {
  // Dev: plain JSON to stdout. pino-pretty uses worker_threads which Next.js
  // dev bundler cannot resolve — the worker chunk ends up missing at runtime.
  // Use `pnpm dev | pnpm exec pino-pretty` if you want pretty output.
  baseLogger = pino({ level: 'debug' })
} else if (axiomToken && axiomDataset) {
  // Production with Axiom: multistream to stdout + Axiom
  const axiomStream = createAxiomStream(axiomToken, axiomDataset)
  baseLogger = pino(
    { level: 'info' },
    pino.multistream([{ stream: process.stdout }, { stream: axiomStream }]),
  )
} else {
  // Production without Axiom: plain JSON to stdout
  baseLogger = pino({ level: 'info' })
}

export const logger = baseLogger

// ---------------------------------------------------------------------------
// Request-scoped logger factory
// ---------------------------------------------------------------------------

export function createLogger(bindings: Record<string, string | number | undefined>) {
  return baseLogger.child(bindings)
}
