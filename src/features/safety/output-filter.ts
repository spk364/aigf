import 'server-only'
import type { BasePayload } from 'payload'
import { scoreText } from './scoring'
import { recordContentFlag, recordSafetyIncident } from './incidents'
import { outputRefusalMessage } from './messages'

// Post-LLM output gate (spec §3.10 Layer 5). The model occasionally drifts into
// disallowed territory even with a strong system prompt; this catches the
// CSAM-class cases and substitutes an in-character refusal.
//
// Only HARD blocks act here. The combinatorial youth/adult scorer is tuned for
// *user intent* and would false-positive on legitimate adult NSFW prose
// ("petite", "innocent smile"), so soft signals are ignored on output — we must
// not silently rewrite normal companion replies.

export type OutputFilterDecision =
  | { safe: true }
  | { safe: false; replacement: string }

export type CheckOutputArgs = {
  payload: BasePayload
  userId: string | number | null | undefined
  text: string
  locale?: string
  relatedMessageId?: string | number | null
  relatedCharacterId?: string | number | null
}

export async function checkAssistantOutput(args: CheckOutputArgs): Promise<OutputFilterDecision> {
  const result = scoreText(args.text)
  if (result.action !== 'hard_block') return { safe: true }

  const severe = result.severe

  await recordContentFlag(args.payload, {
    userId: args.userId,
    flagType: 'blocked_output',
    context: {
      category: result.category,
      reason: result.reason,
      matched: result.matched.slice(0, 10),
      source: 'web',
    },
  })

  await recordSafetyIncident(args.payload, {
    userId: args.userId,
    severity: severe ? 'critical' : 'high',
    category: result.category,
    triggeredAt: 'output_filter',
    detectionMethod: 'keyword',
    relatedMessageId: args.relatedMessageId,
    relatedCharacterId: args.relatedCharacterId,
    scoringDetails: result.details,
    evidenceSnapshot: { matched: result.matched.slice(0, 10), reason: result.reason },
  })

  return { safe: false, replacement: outputRefusalMessage(args.locale) }
}
