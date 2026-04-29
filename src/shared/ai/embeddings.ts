// OpenAI text-embedding-3-small (1536 dim) client.
// Returns null when OPENAI_API_KEY is not configured — callers must handle
// the null case gracefully (memory features degrade silently without embeddings).
import { env } from '@/shared/config/env'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!env.OPENAI_API_KEY) return null

  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 8192)

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
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI embeddings error ${response.status}: ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }

  return data.data[0]?.embedding ?? null
}

/** Format a number[] as a Postgres vector literal: '[0.1,0.2,...]' */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
