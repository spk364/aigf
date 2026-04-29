// Relationship score computation — spec §3.7.
// score = min(100, totalMessages × 0.1 + daysActive × 2 - daysSinceLastMessage × 0.5)
//
// daysActive: approximate — tracked as a separate counter incremented once per UTC calendar
// day when a new message arrives. The conversation must have a daysActiveCount field (added
// alongside this helper). Falls back to 0 if missing.

export type RelationshipScoreInput = {
  messageCount: number
  daysActiveCount: number
  lastMessageAt: string | Date | null
}

export function computeRelationshipScore(input: RelationshipScoreInput): number {
  const { messageCount, daysActiveCount, lastMessageAt } = input

  let daysSinceLast = 0
  if (lastMessageAt) {
    const ms = Date.now() - new Date(lastMessageAt).getTime()
    daysSinceLast = Math.max(0, ms / (1000 * 60 * 60 * 24))
  }

  const raw =
    messageCount * 0.1 +
    daysActiveCount * 2 -
    daysSinceLast * 0.5

  return Math.min(100, Math.max(0, Math.round(raw)))
}

// Returns true if the conversation has been active on a new UTC calendar day
// compared to the given lastMessageAt. Used to decide whether to increment
// daysActiveCount.
export function isNewActiveDay(lastMessageAt: string | Date | null): boolean {
  if (!lastMessageAt) return true
  const lastDay = new Date(lastMessageAt).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  return lastDay !== today
}
