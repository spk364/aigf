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
} from './options'
import { getAgePolicy } from '@/shared/ai/age-safety'
import {
  readGuestDraft,
  writeGuestDraft,
  type GuestDraft,
  type GuestPreviewEntry,
} from './guest-cookie'
import { checkGuestPreviewRateLimit } from './guest-rate-limit'

const MAX_PREVIEWS = 6

// Mirrors the admin reference-generation safety negative prompt. Heavy weights
// on under-18 markers are critical given that we don't have human moderation in
// the loop on the teaser flow. We intentionally do NOT push back against
// "young" / "petite" / "small" / "flat chest" — those are valid 18-22 looks
// the user might pick.
const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(underage:1.5), (minor:1.5), (childlike features:1.5), ' +
  'deformed, low quality, multiple people, bad anatomy'

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
// anime we use fast-sdxl (5-10s, generic SDXL handles anime style fine).
// Pony/Illustrious checkpoints are excluded due to 2-3 min cold start.
//
// FLUX has no negative_prompt — for safety we lean harder on positive-prompt
// age markers ("(adult:1.3), (18+ years old:1.3)") in buildPreviewPrompt.
function pickEndpointForStyle(artStyle: string): {
  endpoint: string
  inferenceSteps: number
  guidance: number
} {
  switch (artStyle) {
    case 'anime':
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
  artStyle: z.enum(['realistic', 'anime']).optional(),
  ethnicity: z.array(z.string()).optional(),
  ageDisplay: z.number().min(18).max(99).optional(),
  ageRange: z.enum(['young_adult', 'adult', 'mature', 'experienced']).optional(),
  bodyType: z.enum(['slender', 'average', 'curvy', 'voluptuous']).optional(),
  bust: z.enum(['small', 'medium', 'large', 'huge']).optional(),
  butt: z.enum(['small', 'medium', 'large', 'huge']).optional(),
  hair: z
    .object({
      color: z.string(),
      length: z.string(),
      style: z.string(),
      preset: z.string(),
    })
    .partial()
    .optional(),
  eyes: z.object({ color: z.string() }).partial().optional(),
  features: z.array(z.string()).optional(),
})

const BUST_FRAGMENTS: Record<string, string> = {
  small: 'small natural bust',
  medium: 'medium balanced bust',
  large: 'large full bust',
  huge: 'voluptuous large bust, ample chest',
}

const BUTT_FRAGMENTS: Record<string, string> = {
  small: 'firm toned glutes, athletic backside',
  medium: 'round shapely glutes, balanced curves',
  large: 'full curvy glutes, prominent rear',
  huge: 'voluptuous bubble butt, very pronounced curves',
}

// Map a young_adult/adult/mature/experienced range onto a representative
// numeric age the prompt builders already understand. Floor stays >=21 to
// keep the safety pipeline happy.
const AGE_RANGE_TO_DISPLAY: Record<string, number> = {
  young_adult: 21,
  adult: 24,
  mature: 32,
  experienced: 42,
}

const generateInputSchema = z.object({
  appearance: appearanceSchema,
  language: z.enum(['en', 'ru', 'es']).default('en'),
})

// SFW but alluring — soft glamour styling, suggestive but fully clothed, full-body composition.
// Subject tokens describing the woman's appearance from the user's onboarding
// choices. Style-agnostic — same pieces are layered into either an SD-style
// or anime prompt by buildPreviewPrompt.
function resolveAge(appearance: Record<string, unknown>, fallback: number): number {
  // Pre-policy floor of 18 — callers know their channel and apply a stricter
  // floor (21 for realistic) on top of this. We don't know the art style at
  // this layer, so we keep the absolute legal minimum here.
  if (typeof appearance.ageDisplay === 'number') {
    return Math.max(18, appearance.ageDisplay)
  }
  const range = String(appearance.ageRange ?? '')
  if (range && AGE_RANGE_TO_DISPLAY[range]) {
    return AGE_RANGE_TO_DISPLAY[range]!
  }
  return fallback
}

function buildSubjectTokens(appearance: Record<string, unknown>): string {
  const parts: string[] = []

  const isAnime = String(appearance.artStyle ?? 'realistic') === 'anime'
  const agePolicy = getAgePolicy(isAnime ? 'anime' : 'realistic')
  const safeAge = Math.max(agePolicy.minAge, resolveAge(appearance, agePolicy.defaultBaselineAge))
  // Specific-age anchor at 1.4 dominates the broader 1.2 "21+" safety
  // token in agePolicy.positiveMarkers — without that the model averages
  // across 21..∞ and renders 30+. youthDescriptor pulls the photo-stock
  // prior (mid-30s "mature woman") down to actually-young-adult.
  parts.push(`(${safeAge} years old:1.4)`)
  parts.push(agePolicy.youthDescriptor)
  parts.push(agePolicy.positiveMarkers)

  const ethnicities = Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []
  for (const eth of ethnicities) {
    const opt = ETHNICITIES.find((e) => e.value === eth)
    if (opt?.promptFragment) parts.push(opt.promptFragment)
  }

  const bodyType = String(appearance.bodyType ?? '')
  const bodyOpt = BODY_TYPES.find((b) => b.value === bodyType)
  if (bodyOpt?.promptFragment) parts.push(bodyOpt.promptFragment)

  const bust = String(appearance.bust ?? '')
  if (BUST_FRAGMENTS[bust]) parts.push(BUST_FRAGMENTS[bust]!)
  const butt = String(appearance.butt ?? '')
  if (BUTT_FRAGMENTS[butt]) parts.push(BUTT_FRAGMENTS[butt]!)

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

  return parts.join(', ')
}

// Build a per-style prompt. Realistic uses FLUX's natural-language framing;
// anime uses the masterpiece/best quality tag stack.
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

  // realistic — FLUX schnell wants natural-language sentences, not SD token
  // lists. We also lean hard on explicit adult/legal-age markers in the
  // positive prompt because FLUX ignores negative_prompt.
  return buildFluxRealisticPrompt(appearance)
}

// Produce a natural-language description for FLUX. Pulls the same option
// fragments but rewords them as "with X" / adjectives glued into a sentence.
function buildFluxRealisticPrompt(appearance: Record<string, unknown>): string {
  // FLUX path is realistic-only by design — anime callers never reach it.
  // Floor user-picked age at the realistic policy minimum (21). The fallback
  // when no age was picked is the policy baseline (22), NOT 28 — earlier
  // logic defaulted to 28 which silently shifted "no choice" → "late-20s
  // mature woman", contradicting the young-adult product target.
  const realisticPolicy = getAgePolicy('realistic')
  const safeAge = Math.max(
    realisticPolicy.minAge,
    resolveAge(appearance, realisticPolicy.defaultBaselineAge),
  )

  const ethnicityDescriptors: string[] = []
  const ethnicities = Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []
  for (const eth of ethnicities) {
    const opt = ETHNICITIES.find((e) => e.value === eth)
    if (opt?.promptFragment) ethnicityDescriptors.push(opt.promptFragment)
  }

  const bodyType = String(appearance.bodyType ?? '')
  const bodyOpt = BODY_TYPES.find((b) => b.value === bodyType)
  const bodyDesc = bodyOpt?.promptFragment ?? ''

  const bust = String(appearance.bust ?? '')
  const bustDesc = BUST_FRAGMENTS[bust] ?? ''
  const butt = String(appearance.butt ?? '')
  const buttDesc = BUTT_FRAGMENTS[butt] ?? ''

  const hair = (appearance.hair ?? {}) as Record<string, string>
  const hairColor = HAIR_COLORS.find((h) => h.value === hair.color)?.promptFragment
  const hairLength = HAIR_LENGTHS.find((h) => h.value === hair.length)?.promptFragment
  const hairStyle = HAIR_STYLES.find((h) => h.value === hair.style)?.promptFragment
  const hairDesc = [hairLength, hairStyle, hairColor].filter(Boolean).join(' ')

  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const eyesDesc = EYE_COLORS.find((e) => e.value === eyes.color)?.promptFragment ?? ''

  const descriptors = [
    ethnicityDescriptors.join(' '),
    bodyDesc,
    bustDesc,
    buttDesc,
    hairDesc,
    eyesDesc,
  ].filter(Boolean).join(', ')

  return [
    `Editorial full-body fashion photograph of a confident young woman, ${safeAge} years old, legal-age adult.`,
    descriptors ? `She has ${descriptors}.` : '',
    'She is standing in a relaxed alluring pose, soft contrapposto with one hand on her hip and weight on one leg, giving the camera a playful confident smile and direct eye contact.',
    'She wears a tasteful elegant outfit — a fashionable dress or stylish top with a skirt or well-fitted jeans, fully clothed, heels or stylish shoes visible.',
    'The shot is taken with a professional DSLR, 50mm lens, golden-hour cinematic warm lighting, shallow depth of field with a soft bokeh background.',
    'Photorealistic, sharp focus on her face and full figure, head to toe in frame, magazine-quality 4K editorial photography.',
    `She is clearly a young-adult woman in her early twenties (${safeAge} years old), legal-age adult, no childlike or pre-teen characteristics whatsoever.`,
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
        | 'rate_limited_global'
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
    const errorByReason = {
      hour: 'rate_limited_hour',
      day: 'rate_limited_day',
      global: 'rate_limited_global',
    } as const
    return {
      ok: false,
      error: errorByReason[limit.reason],
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
  } catch (e) {
    console.error('[guest-preview] generateImage failed', { endpoint, artStyle, error: e })
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
    } catch (e) {
      console.warn('[guest-preview] persistGeneratedImage failed', { url: img.url, error: e })
      continue
    }
  }

  if (newPreviews.length === 0) {
    console.error('[guest-preview] all previews dropped', {
      endpoint,
      returnedImages: result.images.length,
    })
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
