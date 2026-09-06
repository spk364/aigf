// Memory extraction job — spec §3.6.
// Triggered every 10 user messages per conversation, via next/server `after` in
// the chat route (NOT a bare `void` call — see the comment there).
// Calls DeepSeek V3 to extract structured facts, embeds them, saves to memory_entries.
import 'server-only'
import type { BasePayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { getEmbedding, toVectorLiteral, EMBEDDING_MODEL } from '@/shared/ai/embeddings'
import { env } from '@/shared/config/env'
import { logger } from '@/shared/lib/logger'

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Given a conversation between a user and an AI companion, extract important facts about the USER (not the AI character).

Focus on extracting facts that would help personalize future conversations.

Categories:
- personal_info: name, age, location, job, family, physical details
- preference: likes, dislikes, hobbies, food, music, interests
- event: something that happened to them recently or in the past
- relationship: their feelings about the character, relationship milestones
- sensitive: health issues, trauma, grief, major life struggles (handle with care)

Rules:
- Only extract facts about the USER, not the AI character
- Each fact should be a clear, standalone sentence
- Importance 1-2: minor/optional, 3: useful, 4: important, 5: critical for personalization
- Skip facts already obvious from context or greetings
- Return an empty array if no significant facts are present
- Maximum 10 facts per extraction

Return ONLY valid JSON, no commentary:
{"facts": [{"category": "personal_info", "content": "User's name is Alex.", "importance": 4}, ...]}`

type ExtractedFact = {
  category: 'personal_info' | 'preference' | 'event' | 'relationship' | 'sensitive'
  content: string
  importance: number
}

type Message = {
  role: string
  content: string | null
  id: string | number
}

async function callLLMForExtraction(messages: Message[]): Promise<ExtractedFact[]> {
  if (!env.OPENROUTER_API_KEY) return []

  const conversation = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content ?? ''}`)
    .join('\n')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: `Extract facts from this conversation:\n\n${conversation}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM extraction failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  const raw = data.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { facts?: ExtractedFact[] }
  const facts = parsed.facts ?? []

  return facts
    .filter(
      (f) =>
        typeof f.content === 'string' &&
        f.content.length > 5 &&
        ['personal_info', 'preference', 'event', 'relationship', 'sensitive'].includes(f.category),
    )
    .map((f) => ({
      category: f.category,
      content: f.content.trim(),
      importance: Math.min(5, Math.max(1, Math.round(f.importance ?? 3))),
    }))
}

/**
 * Comparison key for duplicate detection. The extractor is an LLM, so the same
 * fact comes back with drifting punctuation and casing ("User's name is Alex."
 * vs "user's name is Alex") — compare on letters and digits only.
 */
export function normaliseFact(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Normalised contents already stored for this (user, character) pair. */
async function loadKnownContent(
  payload: BasePayload,
  userId: string | number,
  characterId: string | number,
): Promise<Set<string>> {
  try {
    // Read through Payload rather than raw SQL — it maps the relationship
    // column names (`user_id_id`, `character_id_id`) for us.
    const existing = await payload.find({
      collection: 'memory-entries',
      where: {
        and: [
          { userId: { equals: userId } },
          { characterId: { equals: characterId } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: 500,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return new Set(
      existing.docs.map((d) => normaliseFact(String((d as { content?: unknown }).content ?? ''))),
    )
  } catch (err) {
    // A lookup failure must not cost us the extraction — fall back to inserting
    // everything, which is the pre-dedup behaviour.
    logger.warn({ msg: 'memory.extraction.dedup_lookup_failed', err: err instanceof Error ? err.message : err })
    return new Set()
  }
}

export type ExtractMemoriesInput = {
  payload: BasePayload
  userId: string | number
  characterId: string | number
  conversationId: string | number
  messages: Message[]
  lastExtractedMessageId?: string | number | null
}

export async function extractMemories(input: ExtractMemoriesInput): Promise<void> {
  const { payload, userId, characterId, conversationId, messages } = input

  if (messages.length < 4) return // Not enough context

  let facts: ExtractedFact[]
  try {
    facts = await callLLMForExtraction(messages)
  } catch (err) {
    logger.warn({ msg: 'memory.extraction.llm_failed', conversationId, err: err instanceof Error ? err.message : err })
    return
  }

  if (facts.length === 0) return

  const lastMsg = messages[messages.length - 1]

  // Drop facts we already hold for this (user, character). Extraction re-runs
  // every 10 user turns over an OVERLAPPING ~30-message window, so without this
  // the same fact ("User's name is Alex.") is re-extracted and re-inserted on
  // every pass. Retrieval returns only the top 5, so duplicates crowd out real
  // memories — three copies of one importance-5 fact take three of the slots.
  const known = await loadKnownContent(payload, userId, characterId)
  const fresh = facts.filter((f) => !known.has(normaliseFact(f.content)))
  if (fresh.length === 0) {
    logger.info({ msg: 'memory.extraction.all_duplicates', conversationId, factsCount: facts.length })
    return
  }

  // Save each fact with embedding via raw SQL for the vector column.
  const pool = (payload.db as unknown as PostgresAdapter).pool

  for (const fact of fresh) {
    let embedding: number[] | null = null
    try {
      embedding = await getEmbedding(fact.content)
    } catch (err) {
      logger.warn({ msg: 'memory.extraction.embed_failed', err: err instanceof Error ? err.message : err })
    }

    try {
      // Insert via Payload for FK validation + Payload timestamps.
      const entry = await payload.create({
        collection: 'memory-entries',
        data: {
          userId,
          characterId,
          conversationId,
          category: fact.category,
          content: fact.content,
          importance: fact.importance,
          extractedFromMessageId: lastMsg?.id ?? null,
          extractedAt: new Date().toISOString(),
          embeddingModel: embedding ? EMBEDDING_MODEL : null,
        },
        overrideAccess: true,
      })

      // Update the vector column via raw SQL (Payload has no vector field type).
      if (embedding && pool) {
        const vectorLiteral = toVectorLiteral(embedding)
        await pool.query(
          `UPDATE memory_entries SET embedding = $1::vector WHERE id = $2`,
          [vectorLiteral, entry.id],
        )
      }
    } catch (err) {
      logger.warn({ msg: 'memory.extraction.save_failed', err: err instanceof Error ? err.message : err })
    }
  }

  logger.info({
    msg: 'memory.extraction.done',
    conversationId,
    factsCount: fresh.length,
    duplicatesSkipped: facts.length - fresh.length,
  })
}
