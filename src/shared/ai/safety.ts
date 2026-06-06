import 'server-only'
import { estimateApparentAge } from './apparent-age'
import { getAgePolicy, type ArtStyleHint } from './age-safety'
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

// The apparent-age floor is art-style-aware and tracks the generation policy
// in age-safety.ts: realistic → 21, anime → 18. Without the artStyle the gate
// would apply the realistic 21 floor to anime renders, which read young to the
// VLM by design (the anime policy is deliberately 18+), and reject legitimate
// young-adult anime previews as `below_age_floor`. Apparent-minor (<18 or
// minorRisk) stays a hard severe block for EVERY style — only the soft floor
// moves. Default (no artStyle) → strict realistic 21.
function apparentAgeFloor(artStyle: ArtStyleHint): number {
  return getAgePolicy(artStyle).minAge
}

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
  // Selects the soft apparent-age floor (anime → 18, realistic → 21). Omit to
  // get the strict realistic floor — callers that can't determine the style
  // (e.g. the chat-image job) stay on the conservative 21 gate.
  artStyle?: ArtStyleHint
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
  const floor = apparentAgeFloor(input.artStyle)
  const belowFloor = apparentAge !== null && apparentAge < floor
  const apparentMinor = minorRisk === true || (apparentAge !== null && apparentAge < 18)

  if (minorRisk === true || belowFloor) {
    log.warn({ msg: 'image.age_flagged', apparentAge, minorRisk, floor, artStyle: input.artStyle ?? 'realistic', severe: apparentMinor })
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
