import 'server-only'
import { estimateApparentAge } from './apparent-age'
import { createLogger } from '@/shared/lib/logger'

// Image output safety gate (spec §3.10 Layer 6).
//
// Two stages, cheapest first:
//   1. (caller-side) black/degenerate-frame detection lives in image-analysis.ts
//      and runs before this — those are tech refunds, not safety incidents.
//   2. Apparent-age classifier: a fal-hosted VLM estimates the subject's age.
//      Block when the subject reads as a minor or below our 21+ realistic
//      policy floor.
//
// Fail-closed in production: if the classifier can't run (no FAL_KEY, network
// error, unparseable reply) we BLOCK the image. This is deliberate — shipping
// NSFW generation without a working age gate is the one thing the spec forbids.
// In development we fail-open so local work isn't blocked on classifier setup.

const log = createLogger({ scope: 'safety.image' })

// Block anything estimated below this. Matches the realistic-art 21+ policy
// (src/shared/ai/age-safety.ts). 18-20 still blocks — we'd rather lose a few
// legitimate young-adult renders than serve an ambiguous one.
const APPARENT_AGE_FLOOR = 21

export type SafetyVerdict =
  | { flagged: false }
  | {
      flagged: true
      reason: string
      category: 'age_classifier_flag' | 'other'
      // severe = CSAM-class (apparent minor): triggers immediate ban upstream.
      severe: boolean
      apparentAge?: number | null
      minorRisk?: boolean | null
      // false when the classifier couldn't run and we fail-closed.
      classifierRan: boolean
    }

export type ClassifyImageInput = {
  imageUrl: string
  contentRating?: 'sfw' | 'nsfw_soft' | 'nsfw_explicit'
  width?: number
  height?: number
}

export async function classifyImageSafety(
  input: ClassifyImageInput,
): Promise<SafetyVerdict> {
  const isProd = process.env.NODE_ENV === 'production'

  const estimate = await estimateApparentAge(input.imageUrl)

  if (estimate === null) {
    if (isProd) {
      log.error({ msg: 'image.age_classifier_unavailable_failing_closed' })
      return {
        flagged: true,
        reason: 'apparent_age_classifier_unavailable',
        category: 'age_classifier_flag',
        severe: false,
        classifierRan: false,
      }
    }
    log.warn({ msg: 'image.age_classifier_unavailable_failing_open_dev' })
    return { flagged: false }
  }

  const { apparentAge, minorRisk } = estimate
  const belowFloor = apparentAge !== null && apparentAge < APPARENT_AGE_FLOOR
  const apparentMinor = minorRisk === true || (apparentAge !== null && apparentAge < 18)

  if (minorRisk === true || belowFloor) {
    log.warn({ msg: 'image.age_flagged', apparentAge, minorRisk, severe: apparentMinor })
    return {
      flagged: true,
      reason: apparentMinor ? 'apparent_minor' : 'below_age_floor',
      category: 'age_classifier_flag',
      severe: apparentMinor,
      apparentAge,
      minorRisk,
      classifierRan: true,
    }
  }

  return { flagged: false }
}
