import 'server-only'
import type { BasePayload } from 'payload'
import { classifyImageSafety } from '@/shared/ai/safety'
import type { ArtStyleHint } from '@/shared/ai/age-safety'
import { recordContentFlag, recordSafetyIncident } from './incidents'
import { maybeEscalate } from './escalation'

// Reusable apparent-age gate for generated images on surfaces OTHER than the
// chat-image job (which has its own token-refund flow inline). Used by the
// character builder previews. Runs the classifier, and on a real flag records a
// blocked_image flag + incident and escalates. On classifier-unavailable
// (production fail-closed) it rejects without an incident — that's an infra gap,
// not a user violation.

export type ImageAgeGateResult =
  | { ok: true }
  | { ok: false; reason: string; severe: boolean; classifierRan: boolean }

export type ImageAgeGateArgs = {
  payload: BasePayload
  imageUrl: string
  width?: number
  height?: number
  userId: string | number | null | undefined
  surface: string // 'builder' | 'builder-poll' | ...
  relatedCharacterId?: string | number | null
  // Selects the soft apparent-age floor (anime → 18, realistic → 21). Omit for
  // the strict realistic floor.
  artStyle?: ArtStyleHint
}

export async function gateGeneratedImageAge(args: ImageAgeGateArgs): Promise<ImageAgeGateResult> {
  const verdict = await classifyImageSafety({
    imageUrl: args.imageUrl,
    width: args.width,
    height: args.height,
    artStyle: args.artStyle,
  })
  if (!verdict.flagged) return { ok: true }

  if (!verdict.classifierRan) {
    return { ok: false, reason: 'safety_unavailable', severe: false, classifierRan: false }
  }

  await recordContentFlag(args.payload, {
    userId: args.userId,
    flagType: 'blocked_image',
    context: {
      category: verdict.category,
      reason: verdict.reason,
      apparentAge: verdict.apparentAge ?? null,
      minorRisk: verdict.minorRisk ?? null,
      surface: args.surface,
      source: 'web',
    },
  })

  await recordSafetyIncident(args.payload, {
    userId: args.userId,
    severity: verdict.severe ? 'critical' : 'high',
    category: 'age_classifier_flag',
    triggeredAt: 'apparent_age_classifier',
    detectionMethod: 'vision_model',
    relatedCharacterId: args.relatedCharacterId ?? null,
    evidenceSnapshot: {
      reason: verdict.reason,
      apparentAge: verdict.apparentAge ?? null,
      minorRisk: verdict.minorRisk ?? null,
      surface: args.surface,
    },
  })

  await maybeEscalate(args.payload, args.userId, { severe: verdict.severe })

  return { ok: false, reason: verdict.reason, severe: verdict.severe, classifierRan: true }
}
