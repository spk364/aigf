'use server'
// TODO(safety): run scorer on free-text fields (name, bio, interests) when pipeline lands

import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { generateImage } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { track } from '@/shared/analytics/posthog'
import { ARCHETYPES, ART_STYLES, ETHNICITIES, BODY_TYPES, HAIR_COLORS, HAIR_LENGTHS, HAIR_STYLES, EYE_COLORS, FEATURES } from './options'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'

const NEGATIVE_PROMPT =
  'low quality, blurry, deformed, bad anatomy, extra limbs, extra fingers, watermark, text, signature, multiple people, child, minor, underage, young, teen, juvenile'

const LLM_MODEL = OPENROUTER_MODEL
const LLM_TEMPERATURE = 1.3
const LLM_MAX_TOKENS = 600

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function nanoid6(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function isPremiumUser(payload: Awaited<ReturnType<typeof getPayload>>, userId: string | number): Promise<boolean> {
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [
        { userId: { equals: userId } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  const sub = subResult.docs[0]
  if (!sub) return false
  return (
    sub.plan === 'premium_monthly' ||
    sub.plan === 'premium_yearly' ||
    sub.plan === 'premium_plus_monthly'
  )
}

async function loadDraftOwned(payload: Awaited<ReturnType<typeof getPayload>>, draftId: string, userId: string | number) {
  const draft = await payload.findByID({
    collection: 'character-drafts',
    id: draftId,
    overrideAccess: true,
  })
  if (!draft) throw new Error('Draft not found')
  const draftUserId =
    typeof draft.userId === 'object' && draft.userId !== null
      ? (draft.userId as { id: string | number }).id
      : draft.userId
  if (String(draftUserId) !== String(userId)) throw new Error('Forbidden')
  if (draft.deletedAt) throw new Error('Draft deleted')
  return draft
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

const identitySchema = z.object({
  name: z.string().min(2).max(40).optional(),
  occupation: z.string().max(80).optional(),
  archetype: z.string().optional(),
  traits: z.object({
    shyBold: z.number().min(1).max(10),
    playfulSerious: z.number().min(1).max(10),
    submissiveDominant: z.number().min(1).max(10),
    romanticCasual: z.number().min(1).max(10),
    sweetSarcastic: z.number().min(1).max(10),
    traditionalAdventurous: z.number().min(1).max(10),
  }).partial().optional(),
})

const backstorySchema = z.object({
  bio: z.string().max(2000).optional(),
  interests: z.array(z.string().max(50)).max(20).optional(),
  howYouMet: z.union([
    z.enum(['coffee_shop', 'mutual_friends', 'dating_app', 'neighbors', 'colleagues', 'custom']),
    z.object({ custom: z.string().max(200) }),
  ]).optional(),
  relationshipStage: z.enum(['just_met', 'dating', 'relationship', 'long_term']).optional(),
})

const stepSchemas: Record<number, z.ZodTypeAny> = {
  1: z.object({ appearance: appearanceSchema }).partial(),
  2: z.object({ identity: identitySchema }).partial(),
  3: z.object({ backstory: backstorySchema }).partial(),
  4: z.object({ selectedReferenceMediaAssetId: z.string().nullable().optional() }).partial(),
}

export async function createDraftAction(language: 'en' | 'ru' | 'es') {
  const user = await requireCompleteProfile()
  const locale = await getLocale()
  const payload = await getPayload({ config })

  const premium = await isPremiumUser(payload, user.id)

  if (!premium) {
    const existing = await payload.find({
      collection: 'characters',
      where: {
        and: [
          { kind: { equals: 'custom' } },
          { createdBy: { equals: user.id } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.totalDocs >= 1) {
      return { error: 'free_tier_limit' as const }
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const draft = await payload.create({
    collection: 'character-drafts',
    data: {
      userId: user.id,
      language,
      currentStep: 1,
      data: {},
      previewGenerations: [],
      expiresAt,
    },
    overrideAccess: true,
  })

  redirect(`/${locale}/builder/${draft.id}`)
}

export async function saveDraftStepAction(
  draftId: string,
  step: number,
  data: Record<string, unknown>,
): Promise<{ ok: true; currentStep: number } | { ok: false; error: string }> {
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })

  let draft: Awaited<ReturnType<typeof loadDraftOwned>>
  try {
    draft = await loadDraftOwned(payload, draftId, user.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }

  const schema = stepSchemas[step]
  if (!schema) return { ok: false, error: 'Invalid step' }

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: 'Validation failed: ' + JSON.stringify(parsed.error.flatten()) }
  }

  const existing = (draft.data ?? {}) as Record<string, unknown>
  const merged = { ...existing, ...parsed.data }

  const currentStep = (draft.currentStep as number) ?? 1
  const newStep = Math.max(currentStep, step)

  await payload.update({
    collection: 'character-drafts',
    id: draftId,
    data: {
      data: merged,
      currentStep: newStep,
    },
    overrideAccess: true,
  })

  return { ok: true, currentStep: newStep }
}

function buildPreviewPrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = []

  const artStyle = String(appearance.artStyle ?? 'realistic')
  const artOption = ART_STYLES.find((a) => a.value === artStyle)
  parts.push(artOption?.promptFragment ?? 'photorealistic, high detail, soft lighting')

  parts.push('portrait of a woman')

  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 24
  const safeAge = Math.max(21, ageDisplay)
  parts.push(`${safeAge} years old`)

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

  parts.push('4k, professional photography, detailed face')

  return parts.join(', ')
}

export type GeneratePreviewsResult =
  | { ok: true; previews: Array<{ mediaAssetId: string | number; publicUrl: string }>; used: number }
  | { ok: false; error: string }

export async function generatePreviewsAction(draftId: string): Promise<GeneratePreviewsResult> {
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })

  let draft: Awaited<ReturnType<typeof loadDraftOwned>>
  try {
    draft = await loadDraftOwned(payload, draftId, user.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }

  const previewGenerations = (Array.isArray(draft.previewGenerations) ? draft.previewGenerations : []) as Array<Record<string, unknown>>

  if (previewGenerations.length >= 5) {
    return { ok: false, error: 'preview_limit_reached' }
  }

  const draftData = (draft.data ?? {}) as Record<string, unknown>
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>

  const prompt = buildPreviewPrompt(appearance)

  let result: Awaited<ReturnType<typeof generateImage>>
  try {
    result = await generateImage({
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      imageSize: 'portrait_4_3',
      numImages: 4,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Image generation failed' }
  }

  const previews: Array<{ mediaAssetId: string | number; publicUrl: string }> = []

  for (const img of result.images) {
    let persisted: Awaited<ReturnType<typeof persistGeneratedImage>>
    try {
      persisted = await persistGeneratedImage({
        payload,
        fromUrl: img.url,
        width: img.width,
        height: img.height,
        contentType: img.contentType,
        kind: 'character-preview',
        ownerUserId: user.id,
      })
    } catch {
      continue
    }
    previews.push({ mediaAssetId: persisted.mediaAssetId, publicUrl: persisted.publicUrl })
  }

  if (previews.length === 0) {
    return { ok: false, error: 'Failed to persist any preview images' }
  }

  const newEntries = previews.map((p) => ({
    mediaAssetId: String(p.mediaAssetId),
    promptUsed: prompt,
    generatedAt: new Date().toISOString(),
    selectedAsReference: false,
  }))

  await payload.update({
    collection: 'character-drafts',
    id: draftId,
    data: {
      previewGenerations: [...previewGenerations, ...newEntries],
    },
    overrideAccess: true,
  })

  return { ok: true, previews, used: previewGenerations.length + 1 }
}

export async function selectReferenceAction(
  draftId: string,
  mediaAssetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })

  let draft: Awaited<ReturnType<typeof loadDraftOwned>>
  try {
    draft = await loadDraftOwned(payload, draftId, user.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }

  const previewGenerations = (Array.isArray(draft.previewGenerations) ? draft.previewGenerations : []) as Array<Record<string, unknown>>

  const updatedGenerations = previewGenerations.map((entry) => ({
    ...entry,
    selectedAsReference: String(entry.mediaAssetId) === mediaAssetId,
  }))

  const draftData = (draft.data ?? {}) as Record<string, unknown>

  await payload.update({
    collection: 'character-drafts',
    id: draftId,
    data: {
      data: { ...draftData, selectedReferenceMediaAssetId: mediaAssetId },
      previewGenerations: updatedGenerations,
    },
    overrideAccess: true,
  })

  return { ok: true }
}

function buildSystemPrompt(opts: {
  name: string
  archetypeFragment: string
  bio: string
  occupation: string
  interests: string[]
  howYouMet: string
  relationshipStage: string
  language: string
}): string {
  const langDirective =
    opts.language === 'ru'
      ? 'Always respond in Russian.'
      : opts.language === 'es'
        ? 'Always respond in Spanish.'
        : 'Always respond in English.'

  return [
    `You are ${opts.name}, an AI companion.`,
    opts.archetypeFragment,
    opts.occupation ? `You work as a ${opts.occupation}.` : '',
    opts.bio ? `About you: ${opts.bio}` : '',
    opts.interests.length > 0 ? `Your interests include: ${opts.interests.join(', ')}.` : '',
    opts.howYouMet ? `How you met: ${opts.howYouMet}.` : '',
    `Your relationship stage: ${opts.relationshipStage}.`,
    langDirective,
    'Safety: never describe or imply you are under 21 years old.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function finalizeBuilderAction(
  draftId: string,
): Promise<{ ok: false; error: string } | void> {
  const user = await requireCompleteProfile()
  const locale = await getLocale()
  const payload = await getPayload({ config })

  let draft: Awaited<ReturnType<typeof loadDraftOwned>>
  try {
    draft = await loadDraftOwned(payload, draftId, user.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }

  const draftData = (draft.data ?? {}) as Record<string, unknown>
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const identity = (draftData.identity ?? {}) as Record<string, unknown>
  const backstory = (draftData.backstory ?? {}) as Record<string, unknown>
  const selectedReferenceMediaAssetId = draftData.selectedReferenceMediaAssetId as string | null

  if (!identity.name) return { ok: false, error: 'Name is required' }
  if (!selectedReferenceMediaAssetId) return { ok: false, error: 'Reference image is required' }
  if (!backstory.bio) return { ok: false, error: 'Bio is required' }

  const name = String(identity.name)
  const occupation = String(identity.occupation ?? '')
  const archetypeValue = String(identity.archetype ?? 'sweet_girlfriend')
  const archetypeObj = ARCHETYPES.find((a) => a.value === archetypeValue)
  const archetypeFragment = archetypeObj?.systemPromptFragment ?? ''

  const interests = Array.isArray(backstory.interests) ? (backstory.interests as string[]) : []
  const howYouMetRaw = backstory.howYouMet
  const howYouMet =
    typeof howYouMetRaw === 'object' && howYouMetRaw !== null && 'custom' in (howYouMetRaw as Record<string, unknown>)
      ? String((howYouMetRaw as { custom: string }).custom)
      : String(howYouMetRaw ?? '')
  const relationshipStage = String(backstory.relationshipStage ?? 'just_met')
  const bio = String(backstory.bio ?? '')
  const language = String(draft.language ?? 'en') as 'en' | 'ru' | 'es'

  const systemPrompt = buildSystemPrompt({
    name,
    archetypeFragment,
    bio,
    occupation,
    interests,
    howYouMet,
    relationshipStage,
    language,
  })

  const tagline = archetypeObj
    ? `Your ${archetypeValue.replace(/_/g, ' ')}`
    : 'Your companion'

  const slug = `${slugify(name)}-${nanoid6()}`

  const traits = (identity.traits ?? archetypeObj?.defaultTraits ?? {}) as Record<string, unknown>

  // TODO(moderation): wire custom characters through moderation queue when pipeline lands
  const character = await payload.create({
    collection: 'characters',
    data: {
      kind: 'custom',
      createdBy: user.id,
      language,
      name,
      slug,
      tagline,
      shortBio: bio.slice(0, 200),
      artStyle: String(appearance.artStyle ?? 'realistic') as 'realistic' | 'anime' | '3d_render' | 'stylized',
      archetype: archetypeValue,
      personalityTraits: traits,
      communicationStyle: archetypeObj?.defaultTraits ?? null,
      backstory: {
        occupation,
        interests,
        fullBio: bio,
        howYouMet,
        relationshipStage,
        keyMemories: [],
      },
      systemPrompt,
      systemPromptVersion: 1,
      contentRating: 'sfw',
      isPublished: false,
      moderationStatus: 'approved',
      primaryImageId: selectedReferenceMediaAssetId,
    },
    overrideAccess: true,
  })

  await payload.update({
    collection: 'media-assets',
    id: selectedReferenceMediaAssetId,
    data: {
      kind: 'character_reference',
      ownerCharacterId: character.id,
    },
    overrideAccess: true,
  })

  await payload.update({
    collection: 'character-drafts',
    id: draftId,
    data: { deletedAt: new Date().toISOString() },
    overrideAccess: true,
  })

  const conversation = await payload.create({
    collection: 'conversations',
    data: {
      userId: user.id,
      characterId: character.id,
      characterSnapshot: {
        systemPrompt,
        name,
        personalityTraits: traits,
        backstory: {
          occupation,
          interests,
          fullBio: bio,
          howYouMet,
          relationshipStage,
          keyMemories: [],
        },
        imageModel: null,
      },
      snapshotVersion: 1,
      llmConfig: {
        provider: 'openrouter',
        model: LLM_MODEL,
        tier: 'standard',
        temperature: LLM_TEMPERATURE,
        maxTokens: LLM_MAX_TOKENS,
        snapshotAt: new Date().toISOString(),
      },
      language,
      status: 'active',
    },
    overrideAccess: true,
  })

  track({
    userId: String(user.id),
    event: 'character.created',
    properties: { archetype: archetypeValue, language },
  })

  redirect(`/${locale}/chat/${conversation.id}`)
}
