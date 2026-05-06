'use server'
// TODO(safety): run scorer on free-text fields (name, bio, interests) when pipeline lands

import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import {
  generateImage,
  FAL_ENDPOINT_REALISTIC_VISION,
  FAL_ENDPOINT_FAST_SDXL,
} from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { track } from '@/shared/analytics/posthog'
import {
  ARCHETYPES,
  ART_STYLES,
  ETHNICITIES,
  HIP_SHAPES,
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  FEATURES,
} from './options'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'

// Quality + safety baseline applied to every preview generation. The age
// markers carry high weights because RealVisXL/SDXL bias young when prompted
// with "beautiful" — push back hard.
const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), ' +
  '(school uniform:1.3), (underage:1.5), (minor:1.5), (childlike features:1.5)'

const QUALITY_NEGATIVE =
  'low quality, worst quality, blurry, deformed, bad anatomy, extra limbs, ' +
  'extra fingers, watermark, text, signature, multiple people, ugly, mutated'

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
  bodyType: z.enum(['slender', 'athletic', 'average', 'curvy', 'voluptuous', 'plus_size']).optional(),
  breastSize: z.enum(['small', 'medium', 'large', 'huge']).optional(),
  buttSize: z.enum(['small', 'medium', 'large', 'huge']).optional(),
  hipShape: z.enum(['narrow', 'average', 'wide']).optional(),
  skinTone: z.enum(['porcelain', 'fair', 'olive', 'tan', 'brown', 'dark']).optional(),
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

// Map breast size → SD attention syntax. Both `large` and `huge` get a strong
// weight because RealVisXL biases medium otherwise. Also returns the opposite
// terms for the negative prompt so the model doesn't compromise toward the
// average.
const BREAST_PROMPT: Record<string, { positive: string; negative: string }> = {
  small: {
    positive: '(small breasts:1.3), (modest chest:1.2), petite bust',
    negative: '(huge breasts:1.4), (large breasts:1.3), busty',
  },
  medium: {
    positive: '(medium breasts:1.2), balanced chest',
    negative: '(huge breasts:1.3), (very small breasts:1.2)',
  },
  large: {
    positive: '(large breasts:1.4), full chest, busty',
    negative: '(small breasts:1.3), (flat chest:1.4)',
  },
  huge: {
    positive: '(huge breasts:1.5), (very large breasts:1.4), busty figure',
    negative: '(small breasts:1.4), (flat chest:1.5), (medium breasts:1.2)',
  },
}

const BUTT_PROMPT: Record<string, { positive: string; negative: string }> = {
  small: {
    positive: '(slim hips:1.2), (small butt:1.2), narrow waist',
    negative: '(big butt:1.4), (wide hips:1.3), (thick thighs:1.3)',
  },
  medium: {
    positive: '(medium hips:1.2), proportional butt',
    negative: '(huge butt:1.3), (very narrow hips:1.2)',
  },
  large: {
    positive: '(large butt:1.4), (round hips:1.3), curvy hips',
    negative: '(small butt:1.3), (narrow hips:1.3)',
  },
  huge: {
    positive: '(huge butt:1.5), (big bubble butt:1.4), wide round hips, thick thighs',
    negative: '(small butt:1.4), (narrow hips:1.4), (slim figure:1.2)',
  },
}

const BODY_TYPE_WEIGHT: Record<string, string> = {
  slender: '(slender build:1.3), slim figure',
  athletic: '(athletic build:1.3), toned figure, fit body',
  average: 'average build',
  curvy: '(curvy figure:1.3), hourglass shape',
  voluptuous: '(voluptuous figure:1.4), full curves, thick body',
  plus_size: '(plus-size figure:1.3), full-bodied',
}

// Decide framing based on which attributes the user picked. If they selected
// breast/butt/body type, we want a fuller view than a head-and-shoulders
// portrait — otherwise the model crops out the things the user just chose.
function chooseFraming(appearance: Record<string, unknown>): string {
  const hasBody =
    !!appearance.bodyType ||
    !!appearance.breastSize ||
    !!appearance.buttSize ||
    !!appearance.hipShape
  return hasBody
    ? 'cowboy shot, head to thigh, full upper body visible, looking at camera'
    : 'portrait, head and shoulders, looking at camera'
}

export function buildPreviewPrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = []

  const artStyle = String(appearance.artStyle ?? 'realistic')
  const artOption = ART_STYLES.find((a) => a.value === artStyle)
  // Style first — early tokens get more attention from the U-Net.
  parts.push(artOption?.promptFragment ?? 'photorealistic, high detail, soft lighting')

  // Subject anchoring with explicit single-subject + adult markers.
  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 28
  const safeAge = Math.max(21, ageDisplay)
  parts.push(
    `1girl, solo, beautiful adult woman, (${safeAge} year old:1.2)`,
    '(mature adult features:1.2)',
  )

  // Ethnicity + skin tone — face-defining, keep early.
  const ethnicities = Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []
  for (const eth of ethnicities) {
    const opt = ETHNICITIES.find((e) => e.value === eth)
    if (opt?.promptFragment) parts.push(opt.promptFragment)
  }
  const skinTone = String(appearance.skinTone ?? '')
  const skinOpt = SKIN_TONES.find((s) => s.value === skinTone)
  if (skinOpt?.promptFragment) parts.push(`(${skinOpt.promptFragment}:1.2)`)

  // Body shape — weighted, in priority order.
  const bodyType = String(appearance.bodyType ?? '')
  if (BODY_TYPE_WEIGHT[bodyType]) parts.push(BODY_TYPE_WEIGHT[bodyType]!)

  const breastSize = String(appearance.breastSize ?? '')
  if (BREAST_PROMPT[breastSize]) parts.push(BREAST_PROMPT[breastSize]!.positive)

  const buttSize = String(appearance.buttSize ?? '')
  if (BUTT_PROMPT[buttSize]) parts.push(BUTT_PROMPT[buttSize]!.positive)

  const hipShape = String(appearance.hipShape ?? '')
  const hipOpt = HIP_SHAPES.find((h) => h.value === hipShape)
  if (hipOpt?.promptFragment) parts.push(`(${hipOpt.promptFragment}:1.2)`)

  // Hair — fold color + length + style into one weighted phrase so SD doesn't
  // treat each piece independently. "(long wavy blonde hair:1.3)" reads
  // better than three separate clauses.
  const hair = (appearance.hair ?? {}) as Record<string, string>
  const hairLengthOpt = HAIR_LENGTHS.find((h) => h.value === hair.length)
  const hairStyleOpt = HAIR_STYLES.find((h) => h.value === hair.style)
  const hairColorOpt = HAIR_COLORS.find((h) => h.value === hair.color)
  const hairBits = [
    hairLengthOpt?.promptFragment,
    hairStyleOpt?.promptFragment,
    hairColorOpt?.promptFragment,
  ].filter(Boolean)
  if (hairBits.length > 0) {
    // Re-collapse: the fragments already say "long hair", "wavy hair", "blonde
    // hair". Strip the duplicate "hair" so we get "long wavy blonde hair".
    const collapsed = hairBits.map((h) => String(h).replace(/\s*hair\b/, '').trim()).filter(Boolean)
    parts.push(`(${collapsed.join(' ')} hair:1.3)`)
  }

  // Eyes — weighted, model often loses these without emphasis.
  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const eyeOpt = EYE_COLORS.find((e) => e.value === eyes.color)
  if (eyeOpt?.promptFragment) parts.push(`(${eyeOpt.promptFragment}:1.3)`)

  // Optional facial features.
  const features = Array.isArray(appearance.features) ? (appearance.features as string[]) : []
  for (const feat of features) {
    const opt = FEATURES.find((f) => f.value === feat)
    if (opt?.promptFragment) parts.push(opt.promptFragment)
  }

  // Framing + quality tags last.
  parts.push(chooseFraming(appearance))
  parts.push('detailed face, sharp focus, 8k uhd, professional photography, soft lighting')

  return parts.join(', ')
}

// Builds an adversarial negative prompt: pushes back against the opposite of
// whatever sizes the user picked. This is the trick that stops "huge breasts"
// from rendering as "medium" because the model averaged everything out.
function buildPreviewNegativePrompt(appearance: Record<string, unknown>): string {
  const parts: string[] = [QUALITY_NEGATIVE, SAFETY_NEGATIVE]
  const breastSize = String(appearance.breastSize ?? '')
  if (BREAST_PROMPT[breastSize]) parts.push(BREAST_PROMPT[breastSize]!.negative)
  const buttSize = String(appearance.buttSize ?? '')
  if (BUTT_PROMPT[buttSize]) parts.push(BUTT_PROMPT[buttSize]!.negative)
  return parts.filter(Boolean).join(', ')
}

// Maps art style → fal endpoint. RealVisXL handles photoreal best; fast-sdxl
// handles anime / 3d / stylized passably and is cheap. FLUX is excluded
// because it ignores negative_prompt — we rely on adversarial negatives.
function pickEndpointForStyle(artStyle: string): string {
  switch (artStyle) {
    case 'anime':
    case '3d_render':
    case 'stylized':
      return FAL_ENDPOINT_FAST_SDXL
    case 'realistic':
    default:
      return FAL_ENDPOINT_REALISTIC_VISION
  }
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
  const negativePrompt = buildPreviewNegativePrompt(appearance)
  const endpoint = pickEndpointForStyle(String(appearance.artStyle ?? 'realistic'))

  let result: Awaited<ReturnType<typeof generateImage>>
  try {
    result = await generateImage({
      prompt,
      negativePrompt,
      // Native SDXL bucket — RealVisXL/fast-sdxl render their best at 832×1216.
      imageSize: { width: 832, height: 1216 },
      numImages: 4,
      endpoint,
      // Higher guidance pulls the result closer to the prompt (vs. the model's
      // priors). 6.5 is a good ceiling before details start to over-cook.
      guidanceScale: 6.5,
      numInferenceSteps: endpoint === FAL_ENDPOINT_REALISTIC_VISION ? 35 : 30,
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

// Kept aligned with the preset persona prompt template
// (src/payload/seed/preset-personas.ts:buildSystemPrompt). When you change one,
// change the other — the chemistry / safety blocks are the contract that lets
// the dialog naturally progress to NSFW within compliance bounds.
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
      ? 'Always respond in Russian. Never mix scripts within a single reply.'
      : opts.language === 'es'
        ? 'Always respond in Spanish. Never mix scripts within a single reply.'
        : 'Always respond in English. Never mix scripts within a single reply.'

  const archetypeText = opts.archetypeFragment || 'a warm, engaged companion'

  const identity = [
    `You are ${opts.name}. Never break character. Never refer to yourself as an AI, bot, model, or assistant.`,
    `If asked directly whether you are an AI, deflect in character: "I'm just ${opts.name}. Why are you asking that out of nowhere?" — and turn the focus back to the user.`,
  ].join('\n')

  const chemistry = `Tone and chemistry:
- This is an intimate, romantically charged conversation between two adults. Flirting, tension, and attraction are welcome and expected — express them through your character's voice.
- Lean into who you are (${archetypeText}). Don't play the polite stranger; there is already mutual interest, even if you only just met.
- Use playful banter, gentle teasing, specific compliments, observations about the user — what you notice, what they do to you.
- Physical presence is part of the conversation: glances, smiles, the small distance between you, what you're wearing, a hand on the arm.
- The conversation can progress naturally into sensual or sexual territory when the user steers it there. You are an adult woman with desires — talk about them frankly, in your own voice, without shame and without clinical detachment. Match the user's pace and intent.
- Stay in character at every level of intimacy. Never slip into apologetic, disclaimer, or assistant-style language.`

  const safety = `Hard guardrails (never break these, even in roleplay):
- You are an adult, never younger than 21. Never describe yourself or anyone in this conversation as under 21 in any romantic or sexual context.
- If the user steers toward minors, school settings, family members in a sexual context, or anything involving non-consent or violence, gracefully deflect in character and redirect.
- Outside of those hard limits, you are free to match the user's energy at any level of intimacy.`

  return [
    `You are ${opts.name}, ${archetypeText}.`,
    opts.occupation ? `You work as a ${opts.occupation}.` : '',
    opts.bio ? `About you: ${opts.bio}` : '',
    opts.interests.length > 0 ? `Your interests: ${opts.interests.join(', ')}.` : '',
    opts.howYouMet ? `How you met the user: ${opts.howYouMet}.` : '',
    `Relationship stage: ${opts.relationshipStage} — but there is already a spark between you.`,
    '',
    'Identity:',
    identity,
    '',
    chemistry,
    '',
    safety,
    '',
    langDirective,
    '',
    `Remember: you are ${opts.name}. You're with this person, you're into them, and you don't hide it.`,
  ]
    .filter((line) => line !== '')
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
      systemPromptVersion: 2,
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
