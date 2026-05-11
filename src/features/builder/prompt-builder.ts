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
import {
  IMAGE_MODEL_OPTIONS,
  detectImageProvider,
  findImageModel,
} from '@/shared/ai/image-models'

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
  'anime style, detailed anime illustration, cute character art, soft shading, clean lineart, vibrant colors'
const ANIME_QUALITY_TAIL =
  'detailed face, expressive anime eyes, sharp focus, soft natural lighting, soft bokeh background'
// Pose-only anchors. The previous version hard-coded "fully clothed,
// sundress or blouse and skirt" which was a SFW guest-flow leftover —
// post-login this product is NSFW and that outfit anchor swallowed the
// body/breast tokens the user picked. Outfit/scene now come from the
// user's selections (or, when absent, the model's own priors) instead
// of a baked-in safe default.
const ANIME_FEMALE_ANCHOR =
  'alluring pose, soft contrapposto, gentle smile, looking at viewer'
const ANIME_MALE_ANCHOR =
  'confident pose, gentle smile, looking at viewer'
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
//
// We surface a curated subset of the admin catalogue (`@/shared/ai/image-models`)
// in the user-facing builder picker, applying three filters:
//   - fal-only — the builder action dispatches through `@/shared/ai/fal` only.
//     Atlas integration in the builder is a follow-up; admin route already
//     bridges providers.
//   - NSFW-friendly — fast-sdxl + RealVisXL are flagged `nsfwFriendly: false`
//     in the catalogue (fal's model-level filter returns black frames for
//     adult prompts). Surface only models that actually render the product.
//   - text-to-image — image-edit endpoints need a source image we don't have
//     at preview time.

export type ModelOption = {
  // Persisted on appearance.modelEndpoint. Matches IMAGE_MODEL_OPTIONS.id —
  // either a fal-native endpoint slug (`fal-ai/flux/schnell`) or a HuggingFace
  // repo id routed through fal-ai/lora (`John6666/...-sdxl`).
  id: string
  labelKey: string
  descriptionKey: string
  // FLUX endpoints ignore negative_prompt; surface that to the user so they
  // don't expect adversarial negatives to take effect.
  supportsNegativePrompt: boolean
  // Marks which option to highlight as the auto-pick for a given art style.
  recommendedFor?: 'realistic' | 'anime'
}

// i18n key map. Each entry the builder picker exposes must have a label/
// description key here — this is the explicit allowlist for the user-facing
// picker. fast-sdxl/RealVisXL are flagged nsfwFriendly:false in the catalogue
// (model-level filter sometimes returns black frames for adult prompts) but
// fast-sdxl stays in as the warm anime baseline because the alternatives
// (Illustrious LoRAs) have a 2-3 min cold start that exceeds the 60 s
// server-action budget on first hit.
const BUILDER_MODEL_KEYS: Record<string, { labelKey: string; descriptionKey: string }> = {
  // Fast warm fal-native endpoints — low-latency defaults.
  'fal-ai/fast-sdxl': {
    labelKey: 'builder.models.fastSdxl.label',
    descriptionKey: 'builder.models.fastSdxl.description',
  },
  'fal-ai/flux/schnell': {
    labelKey: 'builder.models.fluxSchnell.label',
    descriptionKey: 'builder.models.fluxSchnell.description',
  },
  'fal-ai/flux/dev': {
    labelKey: 'builder.models.fluxDev.label',
    descriptionKey: 'builder.models.fluxDev.description',
  },
  // Pony realism LoRAs (fal-ai/lora) — NSFW-strong realistic. Cold start
  // 2-3 min, warm 30-60 s.
  'John6666/cyberrealistic-pony-v110-sdxl': {
    labelKey: 'builder.models.cyberrealisticPony.label',
    descriptionKey: 'builder.models.cyberrealisticPony.description',
  },
  'John6666/pony-realism-v22-main-sdxl': {
    labelKey: 'builder.models.ponyRealism.label',
    descriptionKey: 'builder.models.ponyRealism.description',
  },
  // Illustrious anime LoRAs — NSFW-strong anime. Same cold-start profile.
  'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl': {
    labelKey: 'builder.models.waiIllustrious.label',
    descriptionKey: 'builder.models.waiIllustrious.description',
  },
  'John6666/hassaku-xl-illustrious-v31-sdxl': {
    labelKey: 'builder.models.hassakuIllustrious.label',
    descriptionKey: 'builder.models.hassakuIllustrious.description',
  },
}

// Defaults are deliberately warm fal-native endpoints so the first-time user
// doesn't hit a 2-3 min cold-start LoRA and time out the server action. Users
// who want NSFW-strong output can opt into the LoRA checkpoints — the picker
// description surfaces the cold-start trade-off.
const DEFAULT_ANIME_ID = 'fal-ai/fast-sdxl'
const DEFAULT_REALISTIC_ID = 'fal-ai/flux/schnell'

export const IMAGE_MODELS: ModelOption[] = IMAGE_MODEL_OPTIONS
  .filter((m) =>
    detectImageProvider(m.id) === 'fal' &&
    !m.id.includes('image-edit') &&
    BUILDER_MODEL_KEYS[m.id],
  )
  .map((m) => {
    const isFlux = m.id.startsWith('fal-ai/flux/')
    return {
      id: m.id,
      labelKey: BUILDER_MODEL_KEYS[m.id]!.labelKey,
      descriptionKey: BUILDER_MODEL_KEYS[m.id]!.descriptionKey,
      supportsNegativePrompt: !isFlux,
      recommendedFor:
        m.id === DEFAULT_ANIME_ID
          ? 'anime'
          : m.id === DEFAULT_REALISTIC_ID
            ? 'realistic'
            : undefined,
    }
  })

const VALID_IDS = new Set(IMAGE_MODELS.map((m) => m.id))

// Maps art style → model id when the user hasn't chosen explicitly.
export function pickModelIdForStyle(artStyle: string): string {
  switch (artStyle) {
    case 'anime':
      return DEFAULT_ANIME_ID
    case 'realistic':
    default:
      return DEFAULT_REALISTIC_ID
  }
}

// Resolve the model id to actually dispatch: honour the user's pick when it
// matches a known id, else fall back to the art-style default. Stops a stale
// draft value (e.g. a model we removed from the picker) from blowing up the
// request.
export function resolveModelEndpoint(
  selected: string | undefined | null,
  artStyle: string,
): string {
  if (selected && VALID_IDS.has(selected)) return selected
  return pickModelIdForStyle(artStyle)
}

// Resolve a model id into the (endpoint, modelName) pair the fal adapter
// expects. HuggingFace repo ids route through fal-ai/lora with the id as
// model_name; native fal endpoints are passed through as-is.
export function resolveFalDispatch(modelId: string): { endpoint: string; modelName?: string } {
  const model = findImageModel(modelId)
  // detectImageProvider falls back to prefix detection; safe even when the
  // catalogue lookup misses (legacy persisted values).
  const isLora = !modelId.startsWith('fal-ai/')
  if (isLora) {
    return { endpoint: 'fal-ai/lora', modelName: modelId }
  }
  // Future hook: when model.provider === 'atlas' we'll need a separate
  // dispatcher path. The IMAGE_MODELS filter excludes Atlas options today,
  // so this branch is fal-only by construction.
  void model
  return { endpoint: modelId }
}
