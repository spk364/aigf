// OpenAI text-embedding-3-small client, shortened to 512 dimensions.
// Returns null when OPENAI_API_KEY is not configured — callers must handle
// the null case gracefully (memory features degrade silently without embeddings).
import { env } from '@/shared/config/env'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
// The model natively returns 1536 dims but supports shortened output with little
// retrieval loss. 512 dims stored as halfvec (2 bytes each) is ~1 KB per memory
// vs ~6 KB for vector(1536). Must match the column type in
// migrations/0012_memory_v2.sql — a mismatch makes every insert/search throw.
export const EMBEDDING_DIMENSIONS = 512
// Recorded on each memory row so stale vectors can be found and re-embedded
// if the model or dimension ever changes again.
export const EMBEDDING_MODEL_TAG = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`

type EmbedOptions = {
  /** Abort after this long. Keep it short on the chat hot path. */
  timeoutMs?: number
}

export async function getEmbedding(text: string, opts: EmbedOptions = {}): Promise<number[] | null> {
  const [embedding] = (await getEmbeddings([text], opts)) ?? []
  return embedding ?? null
}

/**
 * Embed several texts in ONE request (the endpoint accepts an array). Returns
 * vectors in input order, or null when OPENAI_API_KEY is not configured.
 */
export async function getEmbeddings(
  texts: string[],
  { timeoutMs = 15_000 }: EmbedOptions = {},
): Promise<number[][] | null> {
  if (!env.OPENAI_API_KEY) return null
  if (texts.length === 0) return []

  const cleaned = texts.map((t) => t.replace(/s+/g, ' ').trim().slice(0, 8192))

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleaned,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI embeddings error ${response.status}: ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }

  return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

/** Format a number[] as a Postgres vector literal: '[0.1,0.2,...]' */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
