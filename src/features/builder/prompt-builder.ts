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
  'extra fingers, watermark, text, signature, multiple people, ugly, mutated, ' +
  // Framing negatives — counter the model's tendency to crop above the waist
  // and to render the subject in 3/4 view when the positive prompt asks for
  // full body / front view. SDXL anime checkpoints in particular default to
  // bust shots without these.
  '(cropped:1.3), (out of frame:1.2), (cut off:1.2), ' +
  '(side view:1.2), (profile view:1.2), (back view:1.3), ' +
  '(bust shot:1.2), (close-up:1.2), (portrait crop:1.2)'

// Push back against lingerie / undress on the preview. The product brief
// is "openly sexy but clothed" — visible cleavage and exposed legs are
// allowed (and explicit positive tokens); lingerie / underwear / nudity
// are not. Without these negatives the body-size positives (huge breasts,
// big butt) plus "alluring pose" can pull the model into bra-and-panties
// territory on every other roll.
export const NSFW_RESTRAINT_NEGATIVE =
  '(lingerie:1.3), (underwear:1.3), (bra and panties:1.3), (panties:1.3), ' +
  '(bra:1.2), (nude:1.4), (topless:1.3), (bottomless:1.3), (naked:1.4), ' +
  '(nipples:1.3), (exposed breasts:1.3)'

// Per-size positives carry both an SDXL-weighted token cluster AND a plain
// natural-language descriptor. SDXL checkpoints honour the (token:weight)
// syntax and react to the cup-size descriptors; FLUX ignores parentheses
// entirely and only listens to natural-language sentences. Stacking both
// lets a single string drive both engines without picking the wrong size.
//
// Weights were bumped from 1.5 → 1.7/1.8 because user-reported "huge"
// rendered close to "average" — the breast tokens were getting averaged
// out by the body-type, hair, and outfit clauses that follow them.
const BREAST_PROMPT: Record<string, { positive: string; negative: string }> = {
  flat: {
    positive:
      '(flat chest:1.6), (very small breasts:1.5), (tiny A-cup:1.4), ' +
      'completely flat chest, no cleavage, AAA cup',
    negative: '(huge breasts:1.6), (large breasts:1.5), (cleavage:1.3), busty, big chest',
  },
  small: {
    positive:
      '(small breasts:1.5), (modest A-cup chest:1.4), petite bust, subtle bust line',
    negative: '(huge breasts:1.6), (large breasts:1.5), (cleavage:1.2), busty',
  },
  average: {
    positive: '(medium breasts:1.3), (B-cup chest:1.2), balanced chest, natural bust',
    negative: '(huge breasts:1.4), (very small breasts:1.3), (flat chest:1.3)',
  },
  big: {
    positive:
      '(large breasts:1.6), (D-cup chest:1.5), (deep cleavage:1.4), full busty chest, ' +
      'large heavy breasts, full bust dominating the silhouette',
    negative: '(small breasts:1.5), (flat chest:1.6), (A-cup:1.3)',
  },
  huge: {
    positive:
      '(huge breasts:1.8), (massive G-cup chest:1.7), (gigantic breasts:1.7), ' +
      '(extreme cleavage:1.5), enormous heavy bust, oversized chest, ' +
      'breasts dominate the entire frame, the bust is the focal point of the image',
    negative:
      '(small breasts:1.6), (flat chest:1.7), (medium breasts:1.4), ' +
      '(B-cup:1.3), (modest chest:1.3)',
  },
}

const BUTT_PROMPT: Record<string, { positive: string; negative: string }> = {
  slim: {
    positive:
      '(slim hips:1.4), (small flat butt:1.4), (narrow waist:1.3), ' +
      'small rear, minimal hip width',
    negative: '(big butt:1.5), (wide hips:1.4), (thick thighs:1.4), bubble butt',
  },
  small: {
    positive:
      '(small butt:1.4), (narrow hips:1.3), petite rear, slim waist',
    negative: '(big butt:1.5), (wide hips:1.4), bubble butt',
  },
  athletic: {
    positive:
      '(athletic firm rear:1.4), (toned glutes:1.3), sculpted athletic butt, fit muscular hips',
    negative: '(huge butt:1.4), (flat butt:1.3), saggy rear',
  },
  big: {
    positive:
      '(large butt:1.6), (round bubble butt:1.5), (wide curvy hips:1.4), ' +
      'thick thighs, voluptuous rear, full round behind',
    negative: '(small butt:1.5), (narrow hips:1.4), flat rear',
  },
  huge: {
    positive:
      '(huge butt:1.8), (gigantic bubble butt:1.7), (extra wide hips:1.6), ' +
      '(very thick thighs:1.5), oversized rear, enormous round behind, ' +
      'the butt is the focal point, exaggerated curvy hourglass figure',
    negative:
      '(small butt:1.6), (narrow hips:1.5), (slim figure:1.4), ' +
      '(athletic build:1.3), flat rear',
  },
}

const BODY_TYPE_WEIGHT: Record<string, string> = {
  slim: '(slim slender build:1.3), slim figure',
  athletic: '(athletic build:1.3), toned figure, fit body',
  average: 'average build',
  curvy: '(curvy figure:1.3), hourglass shape',
  bbw: '(voluptuous figure:1.4), full curves, thick body',
}

// Anime prefix loaded with anti-photoreal natural-language tokens.
// FLUX endpoints ignore negative_prompt entirely, so the only lever we
// have to push them away from their photoreal prior is positive-prompt
// disclaimers ("NOT a photo, NOT 3D render"). SDXL checkpoints
// (Illustrious / Pony / fast-sdxl) handle the same tokens and we add
// hard negatives via ANIME_NEGATIVE below for them.
const ANIME_QUALITY_PREFIX =
  '2D anime illustration, japanese anime art style, cel-shaded character drawing, ' +
  'flat color fill, clean lineart, vibrant anime colors, detailed anime illustration, ' +
  'drawn in classic anime style, anime cartoon art, ' +
  'NOT a photo, NOT photorealistic, NOT 3D render, NOT realistic, NOT live action'
const ANIME_QUALITY_TAIL =
  'detailed anime face, expressive anime eyes, sharp focus, soft natural lighting, soft bokeh background'
// Pose-only anchors. The previous version hard-coded "fully clothed,
// sundress or blouse and skirt" which was a SFW guest-flow leftover —
// post-login this product is NSFW and that outfit anchor swallowed the
// body/breast tokens the user picked. Outfit/scene now come from the
// user's selections (or, when absent, the model's own priors) instead
// of a baked-in safe default.
//
// `front view, facing camera` is load-bearing — without it SDXL anime
// checkpoints default to a 3/4 angle. We dropped `soft contrapposto`
// for the same reason; an asymmetric weight-on-one-leg pose almost
// always renders the subject in profile.
const ANIME_FEMALE_ANCHOR =
  'alluring pose, standing pose, front view, facing camera, gentle smile, looking at viewer'
const ANIME_MALE_ANCHOR =
  'confident pose, standing pose, front view, facing camera, gentle smile, looking at viewer'
const ANIME_NEGATIVE =
  '(armor:1.3), (weapon:1.3), (sword:1.2), (gun:1.2), (cape:1.2), ' +
  '(superhero costume:1.3), (combat outfit:1.3), (mecha:1.3), ' +
  '(fighting pose:1.3), (action pose:1.2), (battle scene:1.2), ' +
  '(mature woman:1.2), (heavy makeup:1.1), (face mask:1.2), ' +
  // Anti-photoreal — keep SDXL anime checkpoints from drifting into 3D
  // / photo territory when the prompt has fashion-photo tokens (fitted
  // dress, full body shot). The positive prefix carries the same intent
  // as natural language for FLUX (which ignores negatives).
  '(photorealistic:1.4), (3D render:1.4), (realistic photo:1.4), ' +
  '(live action:1.3), (photograph:1.3), (CGI:1.2), (octane render:1.2)'

// Default outfit when no occupation-specific outfit is in play. Tasteful
// but suggestive: visible cleavage and exposed legs, but explicitly NOT
// lingerie/underwear/nude (per product brief — fully clothed but openly
// sexy). Each slot has its own mild weight so a subsequent occupation
// outfit can override without fighting these tokens.
const DEFAULT_FEMALE_OUTFIT =
  '(deep v-neck top:1.2), (visible cleavage:1.2), (mini skirt:1.2), ' +
  '(exposed thighs:1.2), bare legs, fitted dress, alluring fashion, ' +
  'tasteful but sexy, fully clothed'
const DEFAULT_MALE_OUTFIT =
  'fitted t-shirt, casual jeans, smart casual, fully clothed'

// Outfit tokens keyed by occupation value. When set on identity, this
// replaces the default outfit so the character looks the part. Keep them
// "openly sexy professional" — uniform-coded but with the same revealing
// silhouette philosophy as the default. School-coded outfits are excluded
// for safety even though `student` is a valid occupation: the safety
// negative already pushes hard against `school uniform`.
const OCCUPATION_OUTFIT: Record<string, string> = {
  massage_therapist: '(low-cut spa robe:1.2), open neckline, bare legs, fitted spa wear',
  fitness_coach: '(tight sports bra:1.2), (low-rise yoga shorts:1.2), exposed midriff, athletic wear',
  secretary: '(unbuttoned blouse:1.2), pencil skirt, exposed thighs, office heels, business chic',
  flight_attendant: '(fitted flight attendant uniform:1.2), short skirt, neckerchief, heels',
  librarian: '(unbuttoned blouse:1.2), pencil skirt, glasses, exposed thighs, sensible heels',
  doctor: '(open white coat:1.2), low-cut blouse underneath, fitted skirt, exposed legs, stethoscope',
  nurse: '(short nurse dress:1.2), low neckline, exposed thighs, white stockings, fitted uniform',
  police_officer: '(fitted police shirt:1.2), short uniform skirt, exposed thighs, duty belt, NOT military, NOT armor',
  teacher: '(unbuttoned blouse:1.2), pencil skirt, glasses, exposed thighs, sensible heels',
  // `student` is intentionally translated to "young adult casualwear" — never
  // school uniform, kept as casual/college-aged styling to avoid the
  // school-coded prior.
  student: 'casual crop top, fitted jeans, exposed midriff, college student style, NOT school uniform',
  artist: 'paint-stained tank top, denim shorts, exposed legs, bohemian style',
  lawyer: '(open suit jacket:1.2), low-cut blouse, fitted pencil skirt, exposed legs, heels',
  streamer: 'fitted gaming hoodie, short shorts, exposed thighs, headphones around neck',
  actress: 'glamorous low-cut evening dress, exposed back, high slit skirt, red carpet styling',
  model: 'high-fashion dress, exposed shoulders, plunging neckline, runway styling',
}

// Background / scene tokens keyed by occupation. The previous prompt only
// added an occupation outfit, so a "nurse" rendered in a sexy nurse dress
// against a generic studio backdrop — visually disconnected from her
// occupation. Adding a setting fragment makes the rendered scene match the
// persona ("nurse in a hospital corridor") instead of feeling like a
// fashion shoot. Kept short and weighted modestly so they don't fight the
// subject anchors above.
const OCCUPATION_SCENE: Record<string, string> = {
  massage_therapist: '(spa room background:1.2), candles, soft warm lighting, towels, calm interior',
  fitness_coach: '(modern gym background:1.2), dumbbells, yoga mats, mirrored wall, gym lighting',
  secretary: '(modern office background:1.2), desk, monitor, blinds, corporate interior',
  flight_attendant: '(airplane cabin interior background:1.2), aisle seats, overhead bins, soft cabin lighting',
  librarian: '(library background:1.2), tall bookshelves, warm reading lamps, wooden interior',
  doctor: '(clinic exam room background:1.2), medical equipment, examination table, clinical lighting',
  nurse: '(hospital corridor background:1.2), medical signage, clean tiled floor, fluorescent lighting',
  police_officer:
    '(police station background:1.2), interrogation room or precinct interior, neutral lighting, ' +
    'NOT military, NOT armored vehicle',
  teacher: '(classroom background:1.2), chalkboard, desks, bright classroom lighting',
  student: '(university campus background:1.2), sunlit corridor or library, casual student setting',
  artist: '(art studio background:1.2), easels, canvases, paint-splattered walls, natural skylight',
  lawyer: '(law office background:1.2), bookshelves with leather-bound legal books, mahogany desk',
  streamer:
    '(streaming setup bedroom background:1.2), RGB LED lights, gaming PC, neon glow, dark cozy room',
  actress: '(red carpet background:1.2), spotlights, paparazzi flash, glamorous event setting',
  model: '(fashion runway background:1.2), runway lights, photographers in background, high-fashion setting',
}

// Mood / expression tokens keyed by archetype value. Subtle — they nudge
// expression and pose vibe toward the personality without dominating the
// frame.
const ARCHETYPE_MOOD: Record<string, string> = {
  sweet_girlfriend: 'warm gentle smile, affectionate expression, soft eyes',
  adventurous_spirit: 'bright excited smile, energetic stance, lively expression',
  mysterious_one: 'subtle knowing smile, intense gaze, thoughtful expression',
  confident_leader: 'confident smirk, commanding posture, sharp gaze',
  shy_romantic: 'soft blushing smile, slightly downcast gaze, delicate expression',
  intellectual: 'thoughtful smile, intelligent gaze, refined expression',
  free_spirit: 'carefree wide smile, relaxed playful pose, bright eyes',
  caretaker: 'warm nurturing smile, soft attentive gaze, kind expression',
  dominant_temptress: 'sultry confident smirk, alluring half-lidded gaze, magnetic pose',
  playful_brat: 'mischievous teasing smile, playful tongue out, cheeky gaze',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function chooseFraming(appearance: Record<string, unknown>): string {
  const hasBody =
    !!appearance.bodyType || !!appearance.breastSize || !!appearance.buttSize
  // For body-aware previews we want the whole figure visible from head to
  // toe, dead-on. The previous "cowboy shot, head to thigh, full upper body
  // visible" combination consistently rendered a 3/4 view cropped at the
  // waist on anime SDXL checkpoints — the model reads "upper body" and
  // ignores the implicit lower-body framing. Use explicit "full body" tokens
  // and keep the front-view anchor in line with the pose anchor above.
  return hasBody
    ? 'full body shot, head to toe, full figure visible, standing pose, front view, facing camera'
    : 'portrait, head and shoulders, front view, facing camera'
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

export function buildPreviewPrompt(
  appearance: Record<string, unknown>,
  // Identity (archetype, occupation) and backstory inputs are optional —
  // the preview step on the presets path runs before they're filled, so we
  // gracefully degrade. When they ARE present, the prompt picks up an
  // archetype-mood expression and an occupation-specific outfit so the
  // image actually reflects "playful brat nurse" rather than a generic
  // anime girl in a generic dress.
  identity?: Record<string, unknown>,
  _backstory?: Record<string, unknown>,
): string {
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

  // Archetype mood is optional — overrides the anchor's neutral expression
  // when the user has picked one. Goes early so it can influence pose/face,
  // before body details lock in.
  const archetype = identity ? String(identity.archetype ?? '') : ''
  if (ARCHETYPE_MOOD[archetype]) parts.push(ARCHETYPE_MOOD[archetype]!)

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

  // Outfit slot. Occupation-specific outfit wins (so a "nurse" looks like a
  // sexy nurse, not a generic alluring girl). Falls back to the default
  // sexy-but-clothed anchor (visible cleavage + exposed legs, no lingerie)
  // when no occupation is set.
  const occupation = identity ? String(identity.occupation ?? '') : ''
  const occupationOutfit = OCCUPATION_OUTFIT[occupation]
  if (occupationOutfit) {
    parts.push(occupationOutfit)
  } else if (!isMale) {
    parts.push(DEFAULT_FEMALE_OUTFIT)
  } else {
    parts.push(DEFAULT_MALE_OUTFIT)
  }

  // Scene / background. Same key as the outfit map so a nurse appears in a
  // hospital corridor, not a generic studio backdrop. Falls through silently
  // when no occupation is set — the model picks its own background prior,
  // which on the soft-bokeh anchor below is a clean neutral backdrop.
  const occupationScene = OCCUPATION_SCENE[occupation]
  if (occupationScene) parts.push(occupationScene)

  parts.push(chooseFraming(appearance))
  if (isAnime) {
    parts.push(ANIME_QUALITY_TAIL)
  } else {
    parts.push('detailed face, sharp focus, 8k uhd, professional photography, soft lighting')
  }

  return parts.join(', ')
}

export function buildPreviewNegativePrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = [QUALITY_NEGATIVE, SAFETY_NEGATIVE, NSFW_RESTRAINT_NEGATIVE]
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
  // Art styles for which this model is the auto-pick. A single model may be
  // the default for multiple styles (e.g. FLUX schnell currently is the
  // recommended option for both realistic and anime).
  recommendedFor: Array<'realistic' | 'anime'>
}

// i18n key map. Each entry the builder picker exposes must have a label/
// description key here — this is the explicit allowlist for the user-facing
// picker. Catalogue lookup happens on top, so an id that isn't in
// IMAGE_MODEL_OPTIONS is silently dropped.
//
// Verified-against-fal as of 2026-05-11:
//   - FLUX schnell: warm (~5-10 s), clears explicit prompts, but
//     photoreal-leaning — even with anime tokens FLUX renders a 3D-ish
//     style. Good fast realistic default.
//   - John6666/wai-nsfw-illustrious-sdxl-v150-sdxl,
//     John6666/hassaku-xl-illustrious-v31-sdxl: true SDXL anime
//     checkpoints, no platform-level filter. Cold start 2-3 min, warm
//     30-60 s. Usable thanks to the submit+poll server actions
//     (submitPreviewJobAction / fetchPreviewJobStatusAction) — the
//     client polls fal until the job completes.
//   - John6666/cyberrealistic-pony-v110-sdxl: same architecture, but
//     realistic NSFW-strong instead of anime.
//
// Removed (do NOT re-add without re-verifying):
//   - fal-ai/fast-sdxl — model-level NSFW filter returns
//     "has_nsfw_concepts" on the default outfit prompt.
//   - John6666/pony-realism-v22-main-sdxl — fal 422 "Invalid URL or
//     repository key"; the slug doesn't resolve on fal-ai/lora.
//
// fal-ai/flux/dev was previously removed for "platform NSFW classifier
// blocks adult prompts", but re-verified live 2026-06-08: on the natural-
// language clothed-sexy prompts the chat/builder actually send (e.g. "in
// lingerie, on the bed") it returns a clean photoreal frame in ~7 s,
// has_nsfw_concepts:false — whereas RealVisXL black-frames the SAME prompt
// (its model-level NSFW filter fires) and frequently cold-stalls past the
// poll budget. flux/dev is now the realistic default; very explicit prompts
// can still trip its classifier, for which CyberRealistic Pony stays the
// opt-in NSFW-strong (cold-start) alternative.
const BUILDER_MODEL_KEYS: Record<string, { labelKey: string; descriptionKey: string }> = {
  'fal-ai/flux/dev': {
    labelKey: 'builder.models.fluxDev.label',
    descriptionKey: 'builder.models.fluxDev.description',
  },
  'fal-ai/realistic-vision': {
    labelKey: 'builder.models.realisticVision.label',
    descriptionKey: 'builder.models.realisticVision.description',
  },
  'fal-ai/flux/schnell': {
    labelKey: 'builder.models.fluxSchnell.label',
    descriptionKey: 'builder.models.fluxSchnell.description',
  },
  'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl': {
    labelKey: 'builder.models.waiIllustrious.label',
    descriptionKey: 'builder.models.waiIllustrious.description',
  },
  'John6666/hassaku-xl-illustrious-v31-sdxl': {
    labelKey: 'builder.models.hassakuIllustrious.label',
    descriptionKey: 'builder.models.hassakuIllustrious.description',
  },
  'John6666/cyberrealistic-pony-v110-sdxl': {
    labelKey: 'builder.models.cyberrealisticPony.label',
    descriptionKey: 'builder.models.cyberrealisticPony.description',
  },
}

// FLUX Schnell for anime: warm (~5-10s, no 2-3 min LoRA cold start), NSFW-
// friendly, and not subject to fal's black-frame NSFW classifier. It needs a
// natural-language, explicitly-anime/cel-shaded prompt (callers build one) and
// ignores negative_prompt. Chosen over the Illustrious LoRA for speed.
const DEFAULT_ANIME_ID = 'fal-ai/flux/schnell'
// FLUX Dev by default for realistic. RealVisXL (the previous default) carries
// fal's model-level NSFW classifier (catalogue nsfwFriendly:false): on spicy-
// but-clothed scenes like "in lingerie, on the bed" it returns an all-black
// frame (has_nsfw_concepts fires) which fal.ts then reports as "NSFW filter
// blocked every output", and it also cold-stalls past the poll budget. FLUX
// Dev serves the same prompt clean and photoreal in ~7 s (verified live
// 2026-06-08). It's a FLUX endpoint, so callers build natural-language prompts
// and it ignores negative_prompt — we rely on the positive prompt's adult
// markers plus the input filter. CyberRealistic Pony stays the opt-in NSFW-
// strong (2-3 min cold) alternative for very explicit prompts that can still
// trip FLUX's lighter classifier.
const DEFAULT_REALISTIC_ID = 'fal-ai/flux/dev'

// NSFW-strong model for explicit-nudity scenes. The FLUX defaults above still
// black-frame outright nudity (FLUX's classifier fires). Rather than fall back
// to the Pony/Illustrious LoRAs — which return real nudity but cold-start 2-3
// min on fal — route explicit to Atlas Cloud's WAN 2.6 text-to-image: it's the
// admin's default model, has NO platform safety gate, renders both realistic
// and anime well, and is always warm (verified live 2026-06-08: explicit
// realistic + anime prompts both returned real non-black images in ~13-16 s,
// no cold start). One model covers both art styles.
const NSFW_STRONG_EXPLICIT_ID = 'alibaba/wan-2.6/text-to-image'

// Anime NSFW: Atlas WAN photoreal-izes anime prompts and renders nudity
// conservatively, so an anime character's explicit request used to come back as
// a realistic, clothed photo. WAI NSFW Illustrious is a true SDXL anime
// checkpoint with no platform filter — it renders anime-styled nudity correctly.
// Trade-off: 2-3 min cold start on fal, but the chat image job's ~5 min budget
// (IMAGE_JOB_TIMEOUT_MS) covers it. Routed through fal-ai/lora by the dispatcher.
const NSFW_ANIME_EXPLICIT_ID = 'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl'

export const IMAGE_MODELS: ModelOption[] = IMAGE_MODEL_OPTIONS
  .filter((m) =>
    detectImageProvider(m.id) === 'fal' &&
    !m.id.includes('image-edit') &&
    BUILDER_MODEL_KEYS[m.id],
  )
  .map((m): ModelOption => {
    const isFlux = m.id.startsWith('fal-ai/flux/')
    const recommendedFor: Array<'realistic' | 'anime'> = []
    if (m.id === DEFAULT_ANIME_ID) recommendedFor.push('anime')
    if (m.id === DEFAULT_REALISTIC_ID) recommendedFor.push('realistic')
    return {
      id: m.id,
      labelKey: BUILDER_MODEL_KEYS[m.id]!.labelKey,
      descriptionKey: BUILDER_MODEL_KEYS[m.id]!.descriptionKey,
      supportsNegativePrompt: !isFlux,
      recommendedFor,
    }
  })

const VALID_IDS = new Set(IMAGE_MODELS.map((m) => m.id))

// Maps art style → model id when the user hasn't chosen explicitly. Pass
// `{ explicit: true }` for outright-nudity scenes to get the warm NSFW-strong
// Atlas model instead of the FLUX default (which black-frames nudity).
export function pickModelIdForStyle(
  artStyle: string,
  opts?: { explicit?: boolean },
): string {
  if (opts?.explicit) {
    // Anime explicit needs an anime NSFW checkpoint, not the realistic-leaning
    // Atlas WAN — otherwise an anime character gets a photoreal (and clothed)
    // image. Realistic explicit stays on warm Atlas.
    return artStyle === 'anime' ? NSFW_ANIME_EXPLICIT_ID : NSFW_STRONG_EXPLICIT_ID
  }
  return artStyle === 'anime' ? DEFAULT_ANIME_ID : DEFAULT_REALISTIC_ID
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
