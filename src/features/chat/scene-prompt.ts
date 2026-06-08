// Builds the image prompt for an in-chat photo the SAME way the admin
// "Generate scenes" flow does (src/app/api/admin/characters/[id]/generate-image).
//
// Why this exists: chat photos go to the Atlas WAN 2.6 model, exactly like
// admin Generate scenes. The two were sending byte-identical Atlas requests
// EXCEPT the prompt — chat's old builder (image-prompt.ts, tuned for SDXL/FLUX)
// dumped the full weighted appearancePrompt plus the raw user message as a
// "scene hint", and Atlas/WAN would sit in `processing` forever on it. The
// admin's template (prefer the clean subjectTokens, Atlas-friendly phrasing)
// completes fast. Mirroring it here removes the prompt as a variable.

import { getSafetyAdultMarkerString, type ArtStyleHint } from '@/shared/ai/age-safety'
import { classifyShot, shotFramingTokens, type ShotType } from './shot-framing'

const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const BASE_NEGATIVE =
  'low quality, blurry, deformed, bad anatomy, extra limbs, watermark, text, signature'

export type SceneAppearance = {
  appearancePrompt?: string | null
  subjectTokens?: string | null
  negativePrompt?: string | null
  safetyAdultMarkers?: string[] | null
}

export type BuildScenePromptInput = {
  appearance?: SceneAppearance | null
  artStyle?: ArtStyleHint
  /** Free-form scene description (outfit / pose / setting). */
  scene?: string
  /** True when the target model is FLUX — needs natural-language prompts and
      ignores negative prompts. */
  isFlux?: boolean
  /** Shot framing (selfie / full body / …). Defaults to classifying the scene
      text so callers that don't compute it still get sensible framing. */
  shot?: ShotType
}

/**
 * Assemble { prompt, negativePrompt } for a character photo, mirroring the
 * admin Generate-scenes route's non-FLUX (SDXL/Atlas) branch.
 */
export function buildCharacterScenePrompt(
  input: BuildScenePromptInput,
): { prompt: string; negativePrompt: string } {
  const appearance = input.appearance ?? null
  const isAnime = input.artStyle === 'anime'
  const ageMarkerPhrase = getSafetyAdultMarkerString(isAnime ? 'anime' : 'realistic')
  const safetyMarkers = appearance?.safetyAdultMarkers?.join(', ') ?? ''
  const scene = (input.scene ?? '').trim()

  // Framing tokens steer how much of the body is shown so the photo matches the
  // request (a selfie stays a close-up; "lying on the bed in a dress" comes back
  // full-body, not a cropped headshot). Defaults to classifying the scene text.
  const shot = input.shot ?? classifyShot(scene)
  const framing = shotFramingTokens(shot, { isFlux: !!input.isFlux, isAnime })

  let prompt: string
  if (input.isFlux) {
    // FLUX wants natural language, not SD tokens, and ignores negative prompts.
    const subjectDesc = appearance?.subjectTokens
      ? appearance.subjectTokens.replace(/, /g, ' with ')
      : 'a beautiful young woman'
    const adultPhrase = isAnime ? '18+ adult woman' : '21+ adult woman'
    const scenePart = scene ? `${scene}. ` : ''
    prompt = isAnime
      ? `${scenePart}${framing.positive} 2D anime illustration, japanese anime art style, cel-shaded, clean lineart, vibrant anime colors. The character is ${subjectDesc}. ${adultPhrase}.`
      : `${scenePart}${framing.positive} Photorealistic. The woman is ${subjectDesc}. High quality, soft natural lighting, ${adultPhrase}.`
  } else if (isAnime) {
    // Anime SDXL models (Illustrious / Pony) want the character's anime-styled
    // appearancePrompt (or danbooru-ish subjectTokens) — never "RAW photo /
    // photorealistic", which fights the model.
    const base =
      appearance?.appearancePrompt ||
      appearance?.subjectTokens ||
      'anime illustration, masterpiece, best quality, beautiful young woman, detailed'
    prompt = [base, framing.positive, scene, safetyMarkers || ageMarkerPhrase]
      .filter(Boolean)
      .join(', ')
  } else if (scene && appearance?.subjectTokens) {
    // Framing leads so SDXL weighs composition over the face-heavy subject tokens.
    prompt = [
      'RAW photo',
      framing.positive,
      scene,
      appearance.subjectTokens,
      safetyMarkers,
      '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  } else if (appearance?.appearancePrompt) {
    prompt = [appearance.appearancePrompt, framing.positive, safetyMarkers, scene]
      .filter(Boolean)
      .join(', ')
  } else {
    prompt = [
      framing.positive,
      scene || 'a beautiful young woman, photorealistic, high detail, soft natural lighting',
      safetyMarkers || ageMarkerPhrase,
      '8k uhd, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  }

  const baseNegative = appearance?.negativePrompt
    ? `${appearance.negativePrompt}, ${SAFETY_NEGATIVE}`
    : `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}`
  const negativePrompt = framing.negative ? `${baseNegative}, ${framing.negative}` : baseNegative

  return { prompt, negativePrompt }
}

export type BuildEditPromptInput = {
  /** Free-form scene description (outfit / pose / setting). */
  scene?: string
  artStyle?: ArtStyleHint
  /** True when the request is explicitly for nudity. */
  explicit?: boolean
}

/**
 * Prompt for the reference-conditioned (Atlas WAN image-edit) path. The source
 * image carries the identity, so the prompt's job is the OPPOSITE of the
 * text-to-image builder: it must NOT re-describe the subject (that re-rolls a
 * new person), only instruct the model to keep the same person and restyle the
 * scene.
 *
 * Crucially it must NOT mention body markings AT ALL — not even to forbid them.
 * Diffusion models ignore negation and latch onto the noun, so both "keep their
 * tattoos" AND "do NOT add tattoos" gave tattoo-free references full sleeves.
 * The image-edit conditioning already preserves whatever is in the reference, so
 * we just say "same skin, same body" and stay silent on tattoos/scars/piercings.
 * Verified live 2026-06-08: clean references stay clean across samples while a
 * tattooed reference (Jade) keeps her sleeve. Atlas drops negative_prompt.
 */
export function buildCharacterEditPrompt(
  input: BuildEditPromptInput,
): { prompt: string; negativePrompt: string } {
  const isAnime = input.artStyle === 'anime'
  const scene = (input.scene ?? '').trim() || 'a natural selfie, looking at the camera'
  const stylePhrase = isAnime
    ? 'Keep the 2D anime art style, cel-shaded, clean lineart.'
    : 'Keep it photorealistic with realistic skin texture and natural lighting.'
  const nudityPhrase = input.explicit
    ? ' Full or partial nudity is allowed.'
    : ''

  const prompt =
    'Keep the exact same person and identity from the reference image — same face, ' +
    'same hair, same skin and same body. Do not change who they are. ' +
    `Change only the outfit, pose and setting to: ${scene}. ${stylePhrase}` +
    `${nudityPhrase} Adults only, 18+ content.`

  // Advisory only on Atlas (image-edit ignores negative_prompt), kept for any
  // future SDXL edit backend.
  const negativePrompt = `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}, (different person:1.4), (different face:1.4)`

  return { prompt, negativePrompt }
}
