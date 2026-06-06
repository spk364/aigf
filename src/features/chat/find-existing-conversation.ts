import 'server-only'
import type { getPayload } from 'payload'

type Payload = Awaited<ReturnType<typeof getPayload>>

/**
 * One conversation per (user, character) is the product invariant — the
 * "your conversations" list shows a single, unified thread per companion.
 * Every chat entry point funnels through here before creating so taps from
 * discovery / cards re-open the existing thread instead of spawning a dupe.
 *
 * Returns the most-recently-active non-deleted conversation for the pair, or
 * null when none exists. Picking by -lastMessageAt (then -createdAt as a
 * tiebreaker for freshly-created, never-messaged threads) lands the user in
 * the thread they actually used, even if historical duplicates still exist in
 * the DB before the one-time cleanup runs.
 */
export async function findExistingConversation(
  payload: Payload,
  userId: string | number,
  characterId: string | number,
): Promise<{ id: string | number } | null> {
  const result = await payload.find({
    collection: 'conversations',
    where: {
      and: [
        { userId: { equals: userId } },
        { characterId: { equals: characterId } },
        { deletedAt: { exists: false } },
      ],
    },
    sort: ['-lastMessageAt', '-createdAt'],
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const existing = result.docs[0]
  return existing ? { id: existing.id } : null
}
