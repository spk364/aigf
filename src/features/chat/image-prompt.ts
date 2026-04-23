// TODO(future): replace scene-hint extraction with an LLM call for richer composition

export type BuildImagePromptInput = {
  characterSnapshot: {
    name?: string
    backstory?: { occupation?: string; location?: string }
  }
  userMessage: string
  language: 'en' | 'ru' | 'es' | string
}

const BASE_PROMPT = 'portrait of a young woman, mid-20s, photorealistic, high detail, soft natural lighting, 4k'

const NEGATIVE_PROMPT =
  'low quality, blurry, deformed, bad anatomy, extra limbs, extra fingers, watermark, text, signature, multiple people'

export function buildImagePrompt(input: BuildImagePromptInput): {
  prompt: string
  negativePrompt: string
} {
  const parts: string[] = [BASE_PROMPT]

  const occupation = input.characterSnapshot.backstory?.occupation
  if (occupation) {
    parts.push(`${occupation} aesthetic`)
  }

  const sceneHint = input.userMessage
    .replace(/["\n]/g, ' ')
    .trim()
    .slice(-80)
    .trim()

  if (sceneHint) {
    parts.push(sceneHint)
  }

  return {
    prompt: parts.join(', '),
    negativePrompt: NEGATIVE_PROMPT,
  }
}
