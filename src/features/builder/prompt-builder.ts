// Pure prompt-construction helpers shared between the server (which actually
// dispatches the fal.ai job) and the client (which renders a live preview of
// the prompt in the builder UI). No `'use server'` directive — these run in
// both runtimes.
//
// Keep this file dependency-free except for the option metadata and the
// age-safety policy module; both are already pure.

import {
  ETHNICITIES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
} from './options'
import { getAgePolicy } from '@/shared/ai/age-safety'

// Endpoint slugs duplicated as literals (rather than imported from `@/shared/ai/fal`)
// because that adapter is `'server-only'` and this module is bundled into the
// client through `CharacterBuilderWizard`. Keep these in sync with FAL_ENDPOINT_*
// in `@/shared/ai/fal`.
const FAL_ENDPOINT_REALISTIC_VISION = 'fal-ai/realistic-vision'
const FAL_ENDPOINT_FAST_SDXL = 'fal-ai/fast-sdxl'
const FAL_ENDPOINT_FLUX_SCHNELL = 'fal-ai/flux/schnell'
const FAL_ENDPOINT_FLUX_DEV = 'fal-ai/flux/dev'

// ── Constants ──────────────────────────────────────────────────────────────

export const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (kid:1.5), (loli:1.5), ' +
  '(school uniform:1.3), (underage:1.5), (minor:1.5), (childlike features:1.5)'

export const QUALITY_NEGATIVE =
  'low quality, worst quality, blurry, deformed, bad anatomy, extra limbs, ' +
  'extra fingers, watermark, text, signature, multiple people, ugly, mutated'

const BREAST_PROMPT: Record<string, { positive: string; negative: string }> = {
  flat: {
    positive: '(flat chest:1.4), (very small breasts:1.3)',
    negative: '(huge breasts:1.4), (large breasts:1.3), busty',
  },
  small: {
    positive: '(small breasts:1.3), (modest chest:1.2)',
    negative: '(huge breasts:1.4), (large breasts:1.3), busty',
  },
  average: {
    positive: '(medium breasts:1.2), balanced chest',
    negative: '(huge breasts:1.3), (very small breasts:1.2)',
  },
  big: {
    positive: '(large breasts:1.4), full chest, busty',
    negative: '(small breasts:1.3), (flat chest:1.4)',
  },
  huge: {
    positive: '(huge breasts:1.5), (very large breasts:1.4), busty figure',
    negative: '(small breasts:1.4), (flat chest:1.5), (medium breasts:1.2)',
  },
}

const BUTT_PROMPT: Record<string, { positive: string; negative: string }> = {
  slim: {
    positive: '(slim hips:1.2), (small butt:1.2), narrow waist',
    negative: '(big butt:1.4), (wide hips:1.3), (thick thighs:1.3)',
  },
  small: {
    positive: '(small butt:1.2), narrow hips',
    negative: '(big butt:1.4), (wide hips:1.3)',
  },
  athletic: {
    positive: '(athletic firm rear:1.3), toned glutes',
    negative: '(huge butt:1.3), (flat butt:1.2)',
  },
  big: {
    positive: '(large butt:1.4), (round hips:1.3), curvy hips',
    negative: '(small butt:1.3), (narrow hips:1.3)',
  },
  huge: {
    positive: '(huge butt:1.5), (big bubble butt:1.4), wide round hips, thick thighs',
    negative: '(small butt:1.4), (narrow hips:1.4), (slim figure:1.2)',
  },
}

const BODY_TYPE_WEIGHT: Record<string, string> = {
  slim: '(slim slender build:1.3), slim figure',
  athletic: '(athletic build:1.3), toned figure, fit body',
  average: 'average build',
  curvy: '(curvy figure:1.3), hourglass shape',
  bbw: '(voluptuous figure:1.4), full curves, thick body',
}

const ANIME_QUALITY_PREFIX =
  'anime style, soft anime illustration, cute character art, gentle shading, clean lineart, soft color palette'
const ANIME_QUALITY_TAIL =
  'detailed face, expressive anime eyes, soft cheeks, gentle expression, sharp focus, soft natural lighting'
const ANIME_FEMALE_ANCHOR =
  'casual cute outfit, fully clothed, sundress or blouse and skirt, gentle smile, soft inviting pose, soft contrapposto, looking at viewer'
const ANIME_MALE_ANCHOR =
  'casual outfit, fully clothed, gentle smile, soft relaxed pose, looking at viewer'
const ANIME_NEGATIVE =
  '(armor:1.3), (weapon:1.3), (sword:1.2), (gun:1.2), (cape:1.2), ' +
  '(superhero costume:1.3), (combat outfit:1.3), (mecha:1.3), ' +
  '(fighting pose:1.3), (action pose:1.2), (battle scene:1.2), ' +
  '(mature woman:1.2), (heavy makeup:1.1), (face mask:1.2)'

// ── Helpers ────────────────────────────────────────────────────────────────

function chooseFraming(appearance: Record<string, unknown>): string {
  const hasBody =
    !!appearance.bodyType || !!appearance.breastSize || !!appearance.buttSize
  return hasBody
    ? 'cowboy shot, head to thigh, full upper body visible, looking at camera'
    : 'portrait, head and shoulders, looking at camera'
}

function cleanHairFragment(fragment: string): string {
  return fragment
    .replace(/\bhair\b/g, '')
    .replace(/[\s,]+/g, ' ')
    .trim()
}

function buildHairPhrase(hair: Record<string, string>): string | null {
  const bits = [
    HAIR_LENGTHS.find((h) => h.value === hair.length)?.promptFragment,
    HAIR_STYLES.find((h) => h.value === hair.style)?.promptFragment,
    HAIR_COLORS.find((h) => h.value === hair.color)?.promptFragment,
  ]
    .filter((f): f is string => !!f)
    .map(cleanHairFragment)
    .filter(Boolean)
  if (bits.length === 0) return null
  return `(${bits.join(' ')} hair:1.3)`
}

// ── Prompt builders ────────────────────────────────────────────────────────

export function buildPreviewPrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = []
  const artStyle = String(appearance.artStyle ?? 'realistic')
  const isAnime = artStyle === 'anime'
  const isMale = appearance.gender === 'male'

  if (isAnime) {
    parts.push(ANIME_QUALITY_PREFIX)
  } else {
    parts.push('photorealistic, high detail, soft lighting, RAW photo')
  }

  const agePolicy = getAgePolicy(isAnime ? 'anime' : 'realistic')
  const ageDisplay =
    typeof appearance.ageDisplay === 'number'
      ? appearance.ageDisplay
      : agePolicy.defaultBaselineAge
  const safeAge = Math.max(agePolicy.minAge, ageDisplay)
  if (isMale) {
    parts.push(
      `1boy, solo, handsome young man, (${safeAge} year old:1.4)`,
      agePolicy.youthDescriptor,
      agePolicy.positiveMarkers,
    )
  } else {
    parts.push(
      `1girl, solo, beautiful young woman, (${safeAge} year old:1.4)`,
      agePolicy.youthDescriptor,
      agePolicy.positiveMarkers,
    )
  }

  if (isAnime) {
    parts.push(isMale ? ANIME_MALE_ANCHOR : ANIME_FEMALE_ANCHOR)
  }

  const ethnicity = String(appearance.ethnicity ?? '')
  const ethOpt = ETHNICITIES.find((e) => e.value === ethnicity)
  if (ethOpt?.promptFragment) parts.push(`(${ethOpt.promptFragment}:1.2)`)

  const bodyType = String(appearance.bodyType ?? '')
  if (BODY_TYPE_WEIGHT[bodyType]) parts.push(BODY_TYPE_WEIGHT[bodyType]!)

  if (!isMale) {
    const breastSize = String(appearance.breastSize ?? '')
    if (BREAST_PROMPT[breastSize]) parts.push(BREAST_PROMPT[breastSize]!.positive)
  }

  const buttSize = String(appearance.buttSize ?? '')
  if (BUTT_PROMPT[buttSize]) parts.push(BUTT_PROMPT[buttSize]!.positive)

  const hairPhrase = buildHairPhrase((appearance.hair ?? {}) as Record<string, string>)
  if (hairPhrase) parts.push(hairPhrase)

  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const eyeOpt = EYE_COLORS.find((e) => e.value === eyes.color)
  if (eyeOpt?.promptFragment) parts.push(`(${eyeOpt.promptFragment}:1.3)`)

  parts.push(chooseFraming(appearance))
  if (isAnime) {
    parts.push(ANIME_QUALITY_TAIL)
  } else {
    parts.push('detailed face, sharp focus, 8k uhd, professional photography, soft lighting')
  }

  return parts.join(', ')
}

export function buildPreviewNegativePrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = [QUALITY_NEGATIVE, SAFETY_NEGATIVE]
  if (String(appearance.artStyle ?? 'realistic') === 'anime') parts.push(ANIME_NEGATIVE)
  const breastSize = String(appearance.breastSize ?? '')
  if (BREAST_PROMPT[breastSize]) parts.push(BREAST_PROMPT[breastSize]!.negative)
  const buttSize = String(appearance.buttSize ?? '')
  if (BUTT_PROMPT[buttSize]) parts.push(BUTT_PROMPT[buttSize]!.negative)
  return parts.filter(Boolean).join(', ')
}

export function buildUniquePrompt(
  uniqueDesc: Record<string, unknown>,
  appearance: Record<string, unknown>,
): string {
  const parts: string[] = []
  const isAnime = String(appearance.artStyle ?? 'realistic') === 'anime'

  if (isAnime) {
    parts.push(ANIME_QUALITY_PREFIX)
  } else {
    parts.push('photorealistic, high detail, soft lighting, RAW photo')
  }

  const isMale = appearance.gender === 'male'
  const agePolicy = getAgePolicy(isAnime ? 'anime' : 'realistic')
  const baseline = `${agePolicy.defaultBaselineAge} year old`
  parts.push(
    isMale
      ? `1boy, solo, handsome young man, (${baseline}:1.4)`
      : `1girl, solo, beautiful young woman, (${baseline}:1.4)`,
    agePolicy.youthDescriptor,
    agePolicy.positiveMarkers,
  )

  if (isAnime) {
    parts.push(isMale ? ANIME_MALE_ANCHOR : ANIME_FEMALE_ANCHOR)
  }

  const looks = String(uniqueDesc.looks ?? '').slice(0, 1500).trim()
  if (looks) parts.push(looks)

  parts.push('portrait, head and shoulders, looking at camera')
  if (isAnime) {
    parts.push(ANIME_QUALITY_TAIL)
  } else {
    parts.push('detailed face, sharp focus, 8k uhd, professional photography, soft lighting')
  }
  return parts.join(', ')
}

// ── Model registry ─────────────────────────────────────────────────────────

// Curated NSFW-safe fal.ai endpoints exposed in the builder model picker.
// Avoid Partner endpoints (WAN 2.5/2.6, Kling, Veo, Seedance) — they apply
// server-side moderation and reject the adult prompts this product produces.
export type ModelOption = {
  endpoint: string
  labelKey: string
  descriptionKey: string
  // FLUX endpoints ignore negative_prompt; we surface that to the user so
  // they don't expect adversarial negatives to take effect.
  supportsNegativePrompt: boolean
  // Used to mark which endpoint we'd auto-pick for a given art style.
  recommendedFor?: 'realistic' | 'anime'
}

export const IMAGE_MODELS: ModelOption[] = [
  {
    endpoint: FAL_ENDPOINT_REALISTIC_VISION,
    labelKey: 'builder.models.realisticVision.label',
    descriptionKey: 'builder.models.realisticVision.description',
    supportsNegativePrompt: true,
    recommendedFor: 'realistic',
  },
  {
    endpoint: FAL_ENDPOINT_FAST_SDXL,
    labelKey: 'builder.models.fastSdxl.label',
    descriptionKey: 'builder.models.fastSdxl.description',
    supportsNegativePrompt: true,
    recommendedFor: 'anime',
  },
  {
    endpoint: FAL_ENDPOINT_FLUX_SCHNELL,
    labelKey: 'builder.models.fluxSchnell.label',
    descriptionKey: 'builder.models.fluxSchnell.description',
    supportsNegativePrompt: false,
  },
  {
    endpoint: FAL_ENDPOINT_FLUX_DEV,
    labelKey: 'builder.models.fluxDev.label',
    descriptionKey: 'builder.models.fluxDev.description',
    supportsNegativePrompt: false,
  },
]

const VALID_ENDPOINTS = new Set(IMAGE_MODELS.map((m) => m.endpoint))

// Maps art style → fal endpoint when the user hasn't chosen explicitly.
// RealVisXL handles photoreal best; fast-sdxl handles anime well when the
// prompt is anime-tagged.
export function pickEndpointForStyle(artStyle: string): string {
  switch (artStyle) {
    case 'anime':
      return FAL_ENDPOINT_FAST_SDXL
    case 'realistic':
    default:
      return FAL_ENDPOINT_REALISTIC_VISION
  }
}

// Resolve the endpoint to actually call: honour the user's pick when it
// matches a known endpoint, else fall back to the art-style default. Stops
// a stale draft value (e.g. an endpoint we removed from the picker) from
// blowing up the request.
export function resolveModelEndpoint(
  selected: string | undefined | null,
  artStyle: string,
): string {
  if (selected && VALID_ENDPOINTS.has(selected)) return selected
  return pickEndpointForStyle(artStyle)
}
