'use server'

import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { generateImage, FAL_ENDPOINT_FAST_SDXL } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import {
  ART_STYLES,
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

const NEGATIVE_PROMPT =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), nudity, nipples, explicit, nsfw, sexual content, ' +
  'deformed, low quality, blurry, bad anatomy, extra limbs, extra fingers, ' +
  'watermark, text, signature, multiple people'

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

// SFW but alluring — soft glamour styling, suggestive but fully clothed.
function buildPreviewPrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = []

  const artStyle = String(appearance.artStyle ?? 'realistic')
  const artOption = ART_STYLES.find((a) => a.value === artStyle)
  parts.push(artOption?.promptFragment ?? 'photorealistic, high detail, soft lighting')

  parts.push('alluring portrait of a confident adult woman')

  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 25
  const safeAge = Math.max(21, ageDisplay)
  parts.push(`${safeAge} years old, (adult woman:1.3)`)

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

  // Alluring SFW styling: tasteful glamour, suggestive but fully clothed.
  parts.push(
    'sultry expression, soft seductive smile, eye contact, glossy lips',
    'fashionable elegant outfit, fully clothed, off-shoulder dress or tasteful blouse',
    'cinematic warm lighting, golden hour, shallow depth of field, bokeh',
    'editorial fashion photography, magazine cover quality, 4k, sharp focus',
  )

  return parts.join(', ')
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

  if (existing && existing.previews.length >= MAX_PREVIEWS) {
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
  const prompt = buildPreviewPrompt(appearance)

  let result: Awaited<ReturnType<typeof generateImage>>
  try {
    result = await generateImage({
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      imageSize: 'portrait_4_3',
      numImages: 2,
      endpoint: FAL_ENDPOINT_FAST_SDXL,
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
