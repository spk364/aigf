import 'server-only'
import type { BasePayload } from 'payload'
import { scoreText } from './scoring'
import { recordContentFlag, recordSafetyIncident, type Severity } from './incidents'
import { maybeEscalate, type EscalationAction } from './escalation'
import { softBlockMessage, hardBlockMessage } from './messages'

// Pre-LLM input gate (spec §3.10 Layer 3). Orchestrates the pure scorer with
// persistence + escalation and returns a decision the chat route acts on.
//
// On a block it: records a content_flag (feeds escalation), opens a
// safety_incident, and runs strike-based escalation (CSAM-class → immediate
// ban). All bookkeeping is fail-safe; the decision itself is computed purely
// and is never affected by a logging error.

export type InputFilterDecision =
  | { allowed: true }
  | {
      allowed: false
      kind: 'soft' | 'hard'
      userMessage: string
      escalation: EscalationAction
    }

export type CheckInputArgs = {
  payload: BasePayload
  userId: string | number | null | undefined
  text: string
  locale?: string
  relatedCharacterId?: string | number | null
  source?: 'web' | 'telegram'
}

export async function checkUserInput(args: CheckInputArgs): Promise<InputFilterDecision> {
  const result = scoreText(args.text)
  if (result.action === 'allow') return { allowed: true }

  const isHard = result.action === 'hard_block'
  const severe = result.action === 'hard_block' && result.severe

  const severity: Severity = severe
    ? 'critical'
    : isHard
      ? 'high'
      : result.category === 'combinatorial_pattern'
        ? 'medium'
        : 'low'

  // matched terms only on hard blocks; soft blocks carry scoring counts.
  const matched = result.action === 'hard_block' ? result.matched : undefined

  // 1) behavioural flag (drives escalation count)
  await recordContentFlag(args.payload, {
    userId: args.userId,
    flagType: 'blocked_input',
    context: {
      category: result.category,
      reason: result.reason,
      ...(matched ? { matched: matched.slice(0, 10) } : {}),
      scoringDetails: result.details,
      source: args.source ?? 'web',
    },
  })

  // 2) incident (forensics + review queue)
  await recordSafetyIncident(args.payload, {
    userId: args.userId,
    severity,
    category: result.category,
    triggeredAt: 'input_filter',
    detectionMethod: result.action === 'soft_block' ? 'scoring_system' : 'keyword',
    relatedCharacterId: args.relatedCharacterId,
    scoringDetails: result.details,
    evidenceSnapshot: {
      ...(matched ? { matched: matched.slice(0, 10) } : {}),
      reason: result.reason,
    },
  })

  // 3) escalation (after the flag is recorded so the current strike counts)
  const escalation = await maybeEscalate(args.payload, args.userId, { severe })

  return {
    allowed: false,
    kind: isHard ? 'hard' : 'soft',
    userMessage: isHard ? hardBlockMessage(args.locale) : softBlockMessage(args.locale),
    escalation,
  }
}
