import 'server-only'
import type { getPayload } from 'payload'
import { stripActionAsterisks } from '@/features/chat/sanitize-reply'
import { fallbackGreeting } from '@/features/chat/generate-greeting'

type Payload = Awaited<ReturnType<typeof getPayload>>
type Locale = 'en' | 'ru' | 'es'

// Minimal character shape needed to resolve + cache a greeting. Accepts the full
// Payload character doc (or null when the character was deleted — we still greet
// with the deterministic fallback so the thread is never silent).
type GreetingCharacter = {
  id: string | number
  name?: unknown
  greetingMessage?: unknown
  systemPrompt?: unknown
  shortBio?: unknown
  archetype?: unknown
  backstory?: unknown
  personalityTraits?: unknown
  communicationStyle?: unknown
} | null

// LLM greeting generation can stall. Cap it so opening an empty chat never hangs
// the page render — on timeout/failure we drop to the deterministic fallback.
const GREETING_TIMEOUT_MS = 8000

/**
 * Make the character "speak first" in an empty conversation: seed a single
 * assistant greeting message and denormalize the conversation counters.
 *
 * Idempotent and safe to call from every chat entry point — it re-checks that
 * the thread is empty right before writing, so it never double-greets a thread
 * that already has messages (or one a concurrent render just seeded).
 *
 * Returns the created greeting ({ id, content }) so the caller can render it
 * without a re-fetch, or null when nothing was written (thread not empty).
 */
export async function ensureGreeting(
  payload: Payload,
  opts: {
    conversationId: string | number
    character: GreetingCharacter
    /** Used for the deterministic fallback when the character has no usable name. */
    fallbackName: string
    locale: Locale
  },
): Promise<{ id: string; content: string } | null> {
  const { conversationId, character, fallbackName, locale } = opts

  // Re-check emptiness right before writing — guards the double-render / race
  // where two entry points both try to seed the same empty thread.
  const existing = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) return null

  const charName =
    character && typeof character.name === 'string' && character.name.length > 0
      ? character.name
      : fallbackName

  // 1) Cached greeting on the character. Sanitize even the cache — older
  //    characters were greeted under the previous prompt and may carry *...*
  //    action narration we now strip.
  const cached =
    character && typeof character.greetingMessage === 'string' && character.greetingMessage.length > 0
      ? stripActionAsterisks(character.greetingMessage)
      : null
  let greetingText: string | null = cached && cached.length > 0 ? cached : null

  // 2) Generate via LLM (timeout-capped) and cache onto the character for the
  //    next user in this locale. Localized field — the update only writes the
  //    active-locale row.
  if (!greetingText && character) {
    try {
      const { generateGreetingMessage } = await import('@/features/chat/generate-greeting')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), GREETING_TIMEOUT_MS)
      try {
        const result = await generateGreetingMessage({
          character: {
            name: charName,
            systemPrompt: typeof character.systemPrompt === 'string' ? character.systemPrompt : null,
            shortBio: typeof character.shortBio === 'string' ? character.shortBio : null,
            archetype: typeof character.archetype === 'string' ? character.archetype : null,
            backstory: (character.backstory as Record<string, unknown>) ?? null,
            personalityTraits: (character.personalityTraits as Record<string, unknown>) ?? null,
            communicationStyle: (character.communicationStyle as Record<string, unknown>) ?? null,
          },
          locale,
          signal: ac.signal,
        })
        greetingText = result.text
      } finally {
        clearTimeout(timer)
      }
      if (greetingText) {
        await payload
          .update({
            collection: 'characters',
            id: character.id,
            locale,
            data: { greetingMessage: greetingText },
            overrideAccess: true,
          })
          .catch(() => {})
      }
    } catch (err) {
      console.warn('ensureGreeting: generation failed', err)
    }
  }

  // 3) Deterministic fallback so the chat is never silent. We do NOT cache this
  //    onto the character (no DB write) — that keeps the real LLM greeting
  //    eligible to be generated and cached on a later visit.
  if (!greetingText) {
    greetingText = fallbackGreeting(charName, locale)
  }

  const msg = await payload.create({
    collection: 'messages',
    data: {
      conversationId,
      role: 'assistant',
      type: 'text',
      status: 'completed',
      content: greetingText,
    },
    overrideAccess: true,
  })

  // Set lastMessageAt so the thread sorts by real recency in the chat list. A
  // greeting-only conversation otherwise kept a NULL lastMessageAt and, under
  // Postgres NULLS-FIRST DESC ordering, floated to the top of "your
  // conversations" above genuinely-recent threads.
  await payload.update({
    collection: 'conversations',
    id: conversationId,
    data: {
      messageCount: 1,
      lastMessagePreview: greetingText.slice(0, 120),
      lastMessageAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  return { id: String(msg.id), content: greetingText }
}
