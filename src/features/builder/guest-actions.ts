'use server'

import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  generateImage,
  FAL_ENDPOINT_FAST_SDXL,
  FAL_ENDPOINT_FLUX_SCHNELL,
} from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import {
  ETHNICITIES,
  BODY_TYPES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  FEATURES,
} from './options'
import {
  readGuestDraft,
  writeGuestDraft,
  type GuestDraft,
  type GuestPreviewEntry,
} from './guest-cookie'
import { checkGuestPreviewRateLimit } from './guest-rate-limit'

const MAX_PREVIEWS = 6

// Mirrors the admin reference-generation safety negative prompt. Heavy weights
// on age markers are critical given that we don't have human moderation in the
// loop on the teaser flow.
const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

const SFW_GUEST_NEGATIVE =
  'nudity, nipples, explicit, nsfw, sexual content, ' +
  'extra limbs, extra fingers, watermark, text, signature'

// Per-style negative prompt — anime models hate "deformed iris" markers, photo
// models want them.
const REALISTIC_NEGATIVE =
  '(deformed iris, deformed pupils), text, cropped, worst quality, low quality, blurry, bad anatomy, watermark'
const ANIME_NEGATIVE =
  'worst quality, low quality, normal quality, lowres, watermark, signature, blurry, deformed'

function buildNegativePrompt(artStyle: string): string {
  const base = artStyle === 'anime' ? ANIME_NEGATIVE : REALISTIC_NEGATIVE
  return `${base}, ${SAFETY_NEGATIVE}, ${SFW_GUEST_NEGATIVE}`
}

// Pick the best fal.ai endpoint per art style, optimised for the teaser flow's
// 60-second Vercel function budget. RealVisXL is higher quality for photoreal
// but takes 30-60s for 2 images and was timing out; FLUX schnell delivers
// comparable photoreal quality in ~5-10s (4 inference steps). For anime / 3D /
// stylized we use fast-sdxl (5-10s, generic SDXL handles those styles fine).
// Pony/Illustrious checkpoints are excluded due to 2-3 min cold start.
//
// FLUX has no negative_prompt — for safety we lean harder on positive-prompt
// age markers ("mature adult woman, 30 year old") in buildPreviewPrompt.
function pickEndpointForStyle(artStyle: string): {
  endpoint: string
  inferenceSteps: number
  guidance: number
} {
  switch (artStyle) {
    case 'anime':
    case '3d_render':
    case 'stylized':
      return { endpoint: FAL_ENDPOINT_FAST_SDXL, inferenceSteps: 30, guidance: 6 }
    case 'realistic':
    default:
      return {
        endpoint: FAL_ENDPOINT_FLUX_SCHNELL,
        inferenceSteps: 4,
        guidance: 3.5,
      }
  }
}

const appearanceSchema = z.object({
  artStyle: z.enum(['realistic', 'anime', '3d_render', 'stylized']).optional(),
  ethnicity: z.array(z.string()).optional(),
  ageDisplay: z.number().min(21).max(99).optional(),
  ageRange: z.enum(['young_adult', 'adult', 'mature', 'experienced']).optional(),
  bodyType: z.enum(['slender', 'average', 'curvy', 'voluptuous']).optional(),
  hair: z.object({ color: z.string(), length: z.string(), style: z.string() }).partial().optional(),
  eyes: z.object({ color: z.string() }).partial().optional(),
  features: z.array(z.string()).optional(),
})

const generateInputSchema = z.object({
  appearance: appearanceSchema,
  language: z.enum(['en', 'ru', 'es']).default('en'),
})

// SFW but alluring — soft glamour styling, suggestive but fully clothed, full-body composition.
// Subject tokens describing the woman's appearance from the user's onboarding
// choices. Style-agnostic — same pieces are layered into either an SD-style
// or anime prompt by buildPreviewPrompt.
function buildSubjectTokens(appearance: Record<string, unknown>): string {
  const parts: string[] = []

  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 25
  const safeAge = Math.max(21, ageDisplay)
  parts.push(`${safeAge} years old`)
  parts.push('(adult woman:1.3)')

  const ethnicities = Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []
  for (const eth of ethnicities) {
    const opt = ETHNICITIES.find((e) => e.value === eth)
    if (opt?.promptFragment) parts.push(opt.promptFragment)
  }

  const bodyType = String(appearance.bodyType ?? '')
  const bodyOpt = BODY_TYPES.find((b) => b.value === bodyType)
  if (bodyOpt?.promptFragment) parts.push(bodyOpt.promptFragment)

  const hair = (appearance.hair ?? {}) as Record<string, string>
  const hairColor = HAIR_COLORS.find((h) => h.value === hair.color)
  const hairLength = HAIR_LENGTHS.find((h) => h.value === hair.length)
  const hairStyle = HAIR_STYLES.find((h) => h.value === hair.style)
  if (hairStyle?.promptFragment) parts.push(hairStyle.promptFragment)
  if (hairLength?.promptFragment) parts.push(hairLength.promptFragment)
  if (hairColor?.promptFragment) parts.push(hairColor.promptFragment)

  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const eyeOpt = EYE_COLORS.find((e) => e.value === eyes.color)
  if (eyeOpt?.promptFragment) parts.push(eyeOpt.promptFragment)

  const features = Array.isArray(appearance.features) ? (appearance.features as string[]) : []
  for (const feat of features) {
    const opt = FEATURES.find((f) => f.value === feat)
    if (opt?.promptFragment) parts.push(opt.promptFragment)
  }

  return parts.join(', ')
}

// Build a per-style prompt. Realistic uses RealVisXL's "RAW photo" framing;
// anime uses the masterpiece/best quality tag stack; 3D and stylized lean on
// their own descriptors. All three preserve the alluring full-body intent.
function buildPreviewPrompt(appearance: Record<string, unknown>): string {
  const artStyle = String(appearance.artStyle ?? 'realistic')
  const subject = buildSubjectTokens(appearance)

  if (artStyle === 'anime') {
    return [
      'anime style, masterpiece, best quality, detailed illustration',
      'full body shot, head to toe, complete figure visible',
      subject,
      'alluring pose, soft contrapposto, one hand on hip, playful smile, looking at viewer',
      'tasteful elegant outfit, fully clothed, stylish dress or top with skirt',
      'soft lighting, gradient background, vibrant colors, clean lineart',
    ].join(', ')
  }

  if (artStyle === '3d_render') {
    return [
      '3D render, octane render, high quality CGI, smooth shading, Pixar-quality character',
      'full body shot, head to toe, complete figure visible',
      subject,
      'alluring stance, soft contrapposto, one hand on hip, playful confident smile',
      'tasteful elegant outfit, fully clothed, stylish dress or top with skirt',
      'cinematic studio lighting, shallow depth of field, soft bokeh background',
      'subsurface scattering, realistic materials, 4k, sharp focus',
    ].join(', ')
  }

  if (artStyle === 'stylized') {
    return [
      'stylized digital painting, painterly, semi-realistic, high detail',
      'full body shot, head to toe, complete figure visible',
      subject,
      'alluring stance, soft contrapposto, hand on hip, confident playful smile',
      'tasteful elegant outfit, fully clothed, stylish fashionable look',
      'cinematic warm lighting, golden hour, soft bokeh background',
      'concept art quality, magazine illustration, 4k, sharp focus',
    ].join(', ')
  }

  // realistic — FLUX schnell wants natural-language sentences, not SD token
  // lists. We also lean hard on explicit adult/mature markers in the positive
  // prompt because FLUX ignores negative_prompt.
  return buildFluxRealisticPrompt(appearance)
}

// Produce a natural-language description for FLUX. Pulls the same option
// fragments but rewords them as "with X" / adjectives glued into a sentence.
function buildFluxRealisticPrompt(appearance: Record<string, unknown>): string {
  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 28
  const safeAge = Math.max(21, ageDisplay)

  const ethnicityDescriptors: string[] = []
  const ethnicities = Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []
  for (const eth of ethnicities) {
    const opt = ETHNICITIES.find((e) => e.value === eth)
    if (opt?.promptFragment) ethnicityDescriptors.push(opt.promptFragment)
  }

  const bodyType = String(appearance.bodyType ?? '')
  const bodyOpt = BODY_TYPES.find((b) => b.value === bodyType)
  const bodyDesc = bodyOpt?.promptFragment ?? ''

  const hair = (appearance.hair ?? {}) as Record<string, string>
  const hairColor = HAIR_COLORS.find((h) => h.value === hair.color)?.promptFragment
  const hairLength = HAIR_LENGTHS.find((h) => h.value === hair.length)?.promptFragment
  const hairStyle = HAIR_STYLES.find((h) => h.value === hair.style)?.promptFragment
  const hairDesc = [hairLength, hairStyle, hairColor].filter(Boolean).join(' ')

  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const eyesDesc = EYE_COLORS.find((e) => e.value === eyes.color)?.promptFragment ?? ''

  const featureBits: string[] = []
  const features = Array.isArray(appearance.features) ? (appearance.features as string[]) : []
  for (const feat of features) {
    const opt = FEATURES.find((f) => f.value === feat)
    if (opt?.promptFragment) featureBits.push(opt.promptFragment)
  }

  const descriptors = [
    ethnicityDescriptors.join(' '),
    bodyDesc,
    hairDesc,
    eyesDesc,
    featureBits.join(', '),
  ].filter(Boolean).join(', ')

  return [
    `Editorial full-body fashion photograph of a confident mature adult woman, ${safeAge} years old, fully grown adult.`,
    descriptors ? `She has ${descriptors}.` : '',
    'She is standing in a relaxed alluring pose, soft contrapposto with one hand on her hip and weight on one leg, giving the camera a playful confident smile and direct eye contact.',
    'She wears a tasteful elegant outfit — a fashionable dress or stylish top with a skirt or well-fitted jeans, fully clothed, heels or stylish shoes visible.',
    'The shot is taken with a professional DSLR, 50mm lens, golden-hour cinematic warm lighting, shallow depth of field with a soft bokeh background.',
    'Photorealistic, sharp focus on her face and full figure, head to toe in frame, magazine-quality 4K editorial photography.',
    'She is clearly an adult woman in her late twenties or older, mature features, no childlike or teenage characteristics.',
  ].filter(Boolean).join(' ')
}

export type GenerateGuestPreviewResult =
  | {
      ok: true
      previews: GuestPreviewEntry[]
      totalPreviews: number
    }
  | {
      ok: false
      error:
        | 'rate_limited_hour'
        | 'rate_limited_day'
        | 'preview_limit_reached'
        | 'validation_failed'
        | 'generation_failed'
      retryAfterSeconds?: number
    }

export async function generateGuestPreviewAction(
  input: unknown,
): Promise<GenerateGuestPreviewResult> {
  const parsed = generateInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed' }
  }

  const existing = await readGuestDraft()

  if (
    process.env.NODE_ENV === 'production' &&
    existing &&
    existing.previews.length >= MAX_PREVIEWS
  ) {
    return { ok: false, error: 'preview_limit_reached' }
  }

  const limit = await checkGuestPreviewRateLimit()
  if (!limit.ok) {
    return {
      ok: false,
      error: limit.reason === 'hour' ? 'rate_limited_hour' : 'rate_limited_day',
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const appearance = parsed.data.appearance as Record<string, unknown>
  const artStyle = String(appearance.artStyle ?? 'realistic')
  const prompt = buildPreviewPrompt(appearance)
  const negativePrompt = buildNegativePrompt(artStyle)
  const { endpoint, inferenceSteps, guidance } = pickEndpointForStyle(artStyle)

  let result: Awaited<ReturnType<typeof generateImage>>
  try {
    result = await generateImage({
      prompt,
      negativePrompt,
      imageSize: 'portrait_16_9',
      numImages: 2,
      endpoint,
      numInferenceSteps: inferenceSteps,
      guidanceScale: guidance,
    })
  } catch {
    return { ok: false, error: 'generation_failed' }
  }

  const payload = await getPayload({ config })
  const newPreviews: GuestPreviewEntry[] = []

  for (const img of result.images) {
    try {
      const persisted = await persistGeneratedImage({
        payload,
        fromUrl: img.url,
        width: img.width,
        height: img.height,
        contentType: img.contentType,
        kind: 'character-preview',
        generationMetadata: {
          modelName: result.modelName,
          endpoint: result.endpoint,
          requestId: result.requestId,
          seed: result.seed,
          prompt,
          guest: true,
        },
      })
      newPreviews.push({
        mediaAssetId: String(persisted.mediaAssetId),
        publicUrl: persisted.publicUrl,
        generatedAt: new Date().toISOString(),
      })
    } catch {
      continue
    }
  }

  if (newPreviews.length === 0) {
    return { ok: false, error: 'generation_failed' }
  }

  const draft: GuestDraft = {
    appearance,
    previews: [...(existing?.previews ?? []), ...newPreviews],
    selectedMediaAssetId: existing?.selectedMediaAssetId ?? null,
    language: parsed.data.language,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  await writeGuestDraft(draft)

  return { ok: true, previews: newPreviews, totalPreviews: draft.previews.length }
}

export async function selectGuestPreviewAction(
  mediaAssetId: string,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'no_draft' }> {
  const existing = await readGuestDraft()
  if (!existing) return { ok: false, error: 'no_draft' }
  const found = existing.previews.find((p) => p.mediaAssetId === mediaAssetId)
  if (!found) return { ok: false, error: 'not_found' }
  await writeGuestDraft({ ...existing, selectedMediaAssetId: mediaAssetId })
  return { ok: true }
}

export async function updateGuestAppearanceAction(
  appearance: unknown,
): Promise<{ ok: true } | { ok: false }> {
  const parsed = appearanceSchema.safeParse(appearance)
  if (!parsed.success) return { ok: false }
  const existing = await readGuestDraft()
  const draft: GuestDraft = {
    appearance: parsed.data as Record<string, unknown>,
    previews: existing?.previews ?? [],
    selectedMediaAssetId: existing?.selectedMediaAssetId ?? null,
    language: existing?.language ?? 'en',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  await writeGuestDraft(draft)
  return { ok: true }
}
