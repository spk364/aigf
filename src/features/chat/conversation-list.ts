// Display-layer normalization for the "your conversations" list.
//
// Two DB realities the list has to survive:
//   1. lastMessageAt is NULL on greeting-only / never-answered threads (it's
//      only stamped on a completed assistant turn). Payload sorts by
//      `-lastMessageAt`, and Postgres puts NULLS FIRST on DESC — so those
//      threads float ABOVE genuinely-recent ones. We re-sort here on
//      lastMessageAt ?? createdAt to restore true recency order.
//   2. Legacy duplicate threads per (user, character) still exist until the
//      one-time merge script runs. The list should show one entry per
//      companion — we collapse duplicates, keeping the most-recent.

type ConversationLike = {
  id: string | number
  lastMessageAt?: unknown
  createdAt?: unknown
}

function recencyMs(doc: ConversationLike): number {
  const last = typeof doc.lastMessageAt === 'string' ? doc.lastMessageAt : null
  const created = typeof doc.createdAt === 'string' ? doc.createdAt : null
  const v = last ?? created
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

export function sortAndDedupeConversations<T extends ConversationLike>(
  docs: T[],
  getCharacterId: (doc: T) => string | null,
): T[] {
  const sorted = docs.slice().sort((a, b) => recencyMs(b) - recencyMs(a))
  const seen = new Set<string>()
  const out: T[] = []
  for (const doc of sorted) {
    const charId = getCharacterId(doc)
    // Fall back to the conversation id when the character id can't be resolved,
    // so an un-keyable thread is never silently dropped as a "duplicate".
    const key = charId ?? `conv:${String(doc.id)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(doc)
  }
  return out
}
