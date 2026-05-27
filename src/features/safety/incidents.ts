import 'server-only'
import type { BasePayload } from 'payload'
import { createLogger } from '@/shared/lib/logger'
import { track } from '@/shared/analytics/posthog'
import type { SafetyCategory, ScoringDetails } from './scoring'

// Persistence helpers for the safety pipeline. Every function here is
// fail-safe: it swallows its own errors so a logging failure never blocks or
// crashes the user-facing request that triggered it. The block decision has
// already been made by the caller; this is bookkeeping + forensics.

const log = createLogger({ scope: 'safety' })

export type FlagType = 'blocked_input' | 'blocked_output' | 'blocked_image' | 'rate_limit_hit'

export type RecordFlagInput = {
  userId: string | number | null | undefined
  flagType: FlagType
  // PII-light: matched terms / category / source — never the full message.
  context?: Record<string, unknown>
}

/** Write a behavioural flag. Drives N-strike escalation. Never throws. */
export async function recordContentFlag(
  payload: BasePayload,
  input: RecordFlagInput,
): Promise<void> {
  try {
    await payload.create({
      collection: 'content-flags',
      data: {
        ...(input.userId != null ? { userId: input.userId } : {}),
        flagType: input.flagType,
        context: input.context ?? {},
      },
    })
  } catch (err) {
    log.warn({ msg: 'safety.flag_write_failed', flagType: input.flagType, err: String(err) })
  }
}

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type TriggeredAt =
  | 'input_filter' | 'output_filter' | 'image_filter'
  | 'apparent_age_classifier' | 'user_report' | 'admin'
export type DetectionMethod =
  | 'keyword' | 'classifier' | 'vision_model' | 'scoring_system' | 'manual'
export type ActionTaken =
  | 'none' | 'warning' | 'suspension' | 'ban' | 'content_deletion' | 'reported_to_authorities'

export type RecordIncidentInput = {
  userId: string | number | null | undefined
  severity: Severity
  category: SafetyCategory | 'age_classifier_flag'
  triggeredAt: TriggeredAt
  detectionMethod: DetectionMethod
  relatedMessageId?: string | number | null
  relatedImageId?: string | number | null
  relatedCharacterId?: string | number | null
  scoringDetails?: ScoringDetails | null
  evidenceSnapshot?: Record<string, unknown> | null
  actionTaken?: ActionTaken
}

/**
 * Create a review-worthy incident row. Returns the new incident id (or null on
 * failure). Never throws. Critical/CSAM incidents fire a PostHog event so they
 * surface on the safety dashboard immediately.
 */
export async function recordSafetyIncident(
  payload: BasePayload,
  input: RecordIncidentInput,
): Promise<string | number | null> {
  try {
    const doc = await payload.create({
      collection: 'safety-incidents',
      data: {
        ...(input.userId != null ? { userId: input.userId } : {}),
        severity: input.severity,
        category: input.category,
        triggeredAt: input.triggeredAt,
        detectionMethod: input.detectionMethod,
        ...(input.relatedMessageId != null ? { relatedMessageId: input.relatedMessageId } : {}),
        ...(input.relatedImageId != null ? { relatedImageId: input.relatedImageId } : {}),
        ...(input.relatedCharacterId != null ? { relatedCharacterId: input.relatedCharacterId } : {}),
        ...(input.scoringDetails ? { scoringDetails: input.scoringDetails } : {}),
        ...(input.evidenceSnapshot ? { evidenceSnapshot: input.evidenceSnapshot } : {}),
        status: 'open',
        actionTaken: input.actionTaken ?? 'none',
      },
    })

    if (input.userId != null) {
      track({
        userId: String(input.userId),
        event: 'safety.incident_created',
        properties: {
          severity: input.severity,
          category: input.category,
          triggeredAt: input.triggeredAt,
        },
      })
    }

    log.warn({
      msg: 'safety.incident',
      severity: input.severity,
      category: input.category,
      triggeredAt: input.triggeredAt,
      incidentId: doc.id,
    })
    return doc.id
  } catch (err) {
    log.error({ msg: 'safety.incident_write_failed', category: input.category, err: String(err) })
    return null
  }
}
