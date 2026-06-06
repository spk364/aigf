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

  let prompt: string
  if (isAnime) {
    // Anime models (Illustrious / Pony SDXL) want the character's anime-styled
    // appearancePrompt (or danbooru-ish subjectTokens) — never "RAW photo /
    // photorealistic", which fights the model.
    const base =
      appearance?.appearancePrompt ||
      appearance?.subjectTokens ||
      'anime illustration, masterpiece, best quality, beautiful young woman, detailed'
    prompt = [base, scene, safetyMarkers || ageMarkerPhrase].filter(Boolean).join(', ')
  } else if (scene && appearance?.subjectTokens) {
    prompt = [
      'RAW photo',
      scene,
      appearance.subjectTokens,
      safetyMarkers,
      '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  } else if (appearance?.appearancePrompt) {
    prompt = [appearance.appearancePrompt, safetyMarkers, scene].filter(Boolean).join(', ')
  } else {
    prompt = [
      scene || 'portrait of a beautiful young woman, photorealistic, high detail, soft natural lighting',
      safetyMarkers || ageMarkerPhrase,
      '8k uhd, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  }

  const negativePrompt = appearance?.negativePrompt
    ? `${appearance.negativePrompt}, ${SAFETY_NEGATIVE}`
    : `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}`

  return { prompt, negativePrompt }
}
