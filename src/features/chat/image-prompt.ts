// Assembles the final SD prompt for in-chat image generation.
// Uses character's pre-assembled appearance.appearancePrompt when available;
// falls back to a generic BASE_PROMPT for characters without appearance data.
// safetyAdultMarkers from appearance are always injected (spec §3.5 / §3.10).

export type CharacterAppearance = {
  appearancePrompt?: string | null
  appearancePromptShort?: string | null
  negativePrompt?: string | null
  safetyAdultMarkers?: string[] | null
}

export type BuildImagePromptInput = {
  characterSnapshot: {
    name?: string
    backstory?: { occupation?: string; location?: string }
    appearance?: CharacterAppearance | null
  }
  userMessage: string
  language: 'en' | 'ru' | 'es' | string
}

// Fallback base prompt for characters without appearance data.
const BASE_PROMPT =
  'portrait of a young woman, photorealistic, high detail, soft natural lighting, 4k'

// Hard-coded safety negative prompt — never overrideable by user (spec §3.10 Layer 6).
const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const BASE_NEGATIVE =
  'low quality, blurry, deformed, bad anatomy, extra limbs, extra fingers, watermark, text, signature, multiple people'

export function buildImagePrompt(input: BuildImagePromptInput): {
  prompt: string
  negativePrompt: string
} {
  const appearance = input.characterSnapshot.appearance
  const parts: string[] = []

  if (appearance?.appearancePrompt) {
    // Character has a pre-assembled appearance prompt — use it as base.
    parts.push(appearance.appearancePrompt)

    // Inject mandatory adult safety markers on top (spec §3.10 Layer 6).
    if (appearance.safetyAdultMarkers && appearance.safetyAdultMarkers.length > 0) {
      parts.push(appearance.safetyAdultMarkers.join(', '))
    }
  } else {
    // Fallback: generic base + occupation hint.
    parts.push(BASE_PROMPT)
    const occupation = input.characterSnapshot.backstory?.occupation
    if (occupation) {
      parts.push(`${occupation} aesthetic`)
    }
  }

  // Append scene hint extracted from the last 80 chars of the user's message.
  const sceneHint = input.userMessage
    .replace(/["\n]/g, ' ')
    .trim()
    .slice(-80)
    .trim()
  if (sceneHint) {
    parts.push(sceneHint)
  }

  // Negative: character-specific override or safety base.
  const characterNegative = appearance?.negativePrompt
  const negativePrompt = characterNegative
    ? `${characterNegative}, ${SAFETY_NEGATIVE}`
    : `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}`

  return {
    prompt: parts.join(', '),
    negativePrompt,
  }
}
