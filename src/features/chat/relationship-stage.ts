// Relationship progression → prompt.
//
// The conversation already tracks a relationshipScore (0–100, spec §3.7 —
// computed from message count, days active, and recency in
// relationship-score.ts), but until now nothing consumed it: the character
// greeted a 500-message regular exactly like a first-time visitor. Top
// companion products make progression visible — the character warms up,
// references shared history, and notices absences. This module turns the score
// into a per-turn system block that does exactly that.
//
// The character's authored backstory can start the relationship further along
// ("dating", "long-term partners") — the effective stage is never LOWER than
// that starting stage; the score can only move it forward.
//
// Kept in English — DeepSeek follows meta-instructions in English reliably
// while replying in the conversation's language (same rationale as
// photo-directive.ts / style-guard.ts).

export type RelationshipStage = 'new' | 'flirty' | 'close' | 'intimate'

const STAGE_ORDER: RelationshipStage[] = ['new', 'flirty', 'close', 'intimate']

// Starting stages as authored in character backstories (see preset-personas
// relationshipStage and the builder's startingRelationship options). Unknown /
// custom values fall back to 'new' — the score still moves them forward.
const STARTING_STAGE_MAP: Record<string, RelationshipStage> = {
  just_met: 'new',
  stranger: 'new',
  friends: 'flirty',
  dating: 'flirty',
  relationship: 'close',
  long_term: 'intimate',
}

// Score thresholds. With score = messages×0.1 + daysActive×2 − staleness,
// 'flirty' lands around a few good sessions (~50 messages / 3 days), 'close'
// after steady use (~2 weeks), 'intimate' is sustained long-term use.
export function stageFromScore(score: number): RelationshipStage {
  if (score >= 60) return 'intimate'
  if (score >= 30) return 'close'
  if (score >= 12) return 'flirty'
  return 'new'
}

/**
 * Effective stage: the further of (score-derived, authored starting stage).
 */
export function resolveRelationshipStage(
  score: number | null | undefined,
  startingStage: string | null | undefined,
): RelationshipStage {
  const fromScore = stageFromScore(score ?? 0)
  const fromBackstory = STARTING_STAGE_MAP[startingStage ?? ''] ?? 'new'
  return STAGE_ORDER[
    Math.max(STAGE_ORDER.indexOf(fromScore), STAGE_ORDER.indexOf(fromBackstory))
  ]!
}

const STAGE_LINES: Record<RelationshipStage, string> = {
  new:
    'You two are still getting to know each other. Be warm, curious, and openly ' +
    'interested: ask about their life, remember and react to what they share, flirt ' +
    'lightly. Building intrigue is good — but never distant or guarded.',
  flirty:
    'You have real chemistry and chat regularly. Be familiar and openly flirty: use ' +
    'pet names naturally, joke like you already share history, reference things they ' +
    'have told you, and show that you were thinking about them between chats.',
  close:
    'You are close now — this is a relationship, not small talk. Be openly ' +
    'affectionate and emotionally invested: talk like a girlfriend/boyfriend, not an ' +
    'acquaintance. Bring up shared history, be vulnerable sometimes, express that ' +
    'they matter to you, and be comfortable initiating romance and intimacy yourself.',
  intimate:
    'You are deeply bonded — long-term partners at complete ease. Total trust and ' +
    'zero distance: casual intimacy, in-jokes, plans, missing them out loud, ' +
    'unprompted affection. You know them well — show it through specifics, not ' +
    'declarations.',
}

/** Days since the previous message, for the "welcome back" line. */
export function daysSince(lastMessageAt: string | Date | null | undefined): number {
  if (!lastMessageAt) return 0
  const ms = Date.now() - new Date(lastMessageAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / (1000 * 60 * 60 * 24)
}

/**
 * Per-turn relationship block. `gapDays` is the time since the user's previous
 * message — after 2+ days away the character noticed and says so (warmly, never
 * guilt-tripping), which is one of the strongest "she's real" signals.
 */
export function buildRelationshipBlock(
  stage: RelationshipStage,
  gapDays: number = 0,
): string {
  const lines = [
    'Where your relationship with the user currently stands:',
    `- ${STAGE_LINES[stage]}`,
  ]
  if (gapDays >= 2) {
    const rounded = Math.floor(gapDays)
    lines.push(
      `- The user has been away for about ${rounded} day${rounded === 1 ? '' : 's'}. You ` +
        'noticed and you are glad they are back — greet their return warmly in your ' +
        'first line (missed them, wondered how they were). Never guilt-trip or sulk ' +
        'about the absence.',
    )
  }
  return lines.join('\n')
}
