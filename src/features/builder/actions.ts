'use server'
// TODO(safety): run scorer on free-text fields (name, occupation custom, relationship custom, looks/personality desc) when pipeline lands
//
// Pony/Illustrious LoRA checkpoints exposed in the picker have a 2-3 min
// cold start; warm calls land in 30-60 s for 4 images. The 60 s budget
// for generatePreviewsAction is set on the route segment that calls into
// us — see `src/app/(app)/[locale]/builder/[draftId]/page.tsx`. (Server
// action files can only export async functions, so the config must live
// on the page.)

import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { generateImage } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { fetchAndAnalyzeImage, detectSafetyFilteredFrame } from '@/shared/ai/image-analysis'
import { track } from '@/shared/analytics/posthog'
import {
  ARCHETYPES,
  CHAT_STYLES,
  OCCUPATIONS,
  KINKS,
  DEFAULT_TRAITS,
} from './options'
import {
  buildPreviewPrompt,
  buildPreviewNegativePrompt,
  buildUniquePrompt,
  resolveModelEndpoint,
  resolveFalDispatch,
} from './prompt-builder'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { checkRateLimit } from '@/shared/rate-limit/limiter'
import { IMAGE_GEN_LIMIT } from '@/shared/rate-limit/presets'

const LLM_MODEL = OPENROUTER_MODEL
// Keep aligned with src/app/api/chat/route.ts — see note there on temperature choice.
const LLM_TEMPERATURE = 0.85
const LLM_MAX_TOKENS = 600

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

// Payload's Postgres adapter stores collection IDs as integers; relationship
// fields validate the value's type and 400 with "The following field is
// invalid" when given a numeric string instead of a number. Draft-level state
// (selectedReferenceMediaAssetId) is persisted as a string by the client, so
// we coerce it before passing it as a relationship value. Mirrors the helper
// in src/app/api/admin/characters/[id]/set-primary-image/route.ts.
function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

function nanoid8(): string {
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

// ── Validation schemas ────────────────────────────────────────────────────

const traitsSchema = z.object({
  dominant: z.number().min(1).max(10),
  confident: z.number().min(1).max(10),
  passionate: z.number().min(1).max(10),
  outgoing: z.number().min(1).max(10),
  playful: z.number().min(1).max(10),
}).partial()

const appearanceSchema = z.object({
  gender: z.enum(['female', 'male']).optional(),
  artStyle: z.enum(['realistic', 'anime']).optional(),
  ethnicity: z.enum(['european', 'asian', 'latina', 'african', 'south_asian', 'middle_eastern']).optional(),
  ageDisplay: z.number().min(18).max(99).optional(),
  ageRange: z.enum(['young_adult', 'twenties', 'thirties', 'forties', 'fifties']).optional(),
  bodyType: z.enum(['slim', 'athletic', 'average', 'curvy', 'bbw']).optional(),
  breastSize: z.enum(['flat', 'small', 'average', 'big', 'huge']).optional(),
  buttSize: z.enum(['slim', 'small', 'athletic', 'big', 'huge']).optional(),
  hair: z.object({ color: z.string(), length: z.string(), style: z.string() }).partial().optional(),
  eyes: z.object({ color: z.string() }).partial().optional(),
  // Optional override picked on the preview screen — actions resolve via
  // resolveModelEndpoint() so an unknown value falls back to the art-style
  // default rather than blowing up the request.
  modelEndpoint: z.string().max(120).optional(),
})

const identitySchema = z.object({
  name: z.string().min(2).max(40).optional(),
  archetype: z.string().optional(),
  traits: traitsSchema.optional(),
  sexualOrientation: z.enum(['straight', 'bisexual', 'queer', 'lesbian']).optional(),
  occupation: z.string().max(80).optional(),
  occupationCustom: z.string().max(80).optional(),
})

const backstorySchema = z.object({
  chatStyle: z.enum(['default', 'deep_roleplay', 'creative', 'realistic']).optional(),
  startingRelationship: z.string().optional(),
  startingRelationshipCustom: z.string().max(120).optional(),
  kinks: z.array(z.string()).max(40).optional(),
})

const uniqueDescSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  personality: z.string().max(2000).optional(),
  looks: z.string().max(2000).optional(),
})

const introSchema = z.object({
  pathChoice: z.enum(['presets', 'unique']).optional(),
  appearance: appearanceSchema.partial().optional(),
})

// Each "phase" maps to a save call. Phase 1 = appearance + path/intro,
// 2 = identity, 3 = backstory, 4 = uniqueDesc (only used by the unique path).
const stepSchemas: Record<number, z.ZodTypeAny> = {
  1: introSchema,
  2: z.object({ identity: identitySchema }).partial(),
  3: z.object({ backstory: backstorySchema }).partial(),
  4: z.object({ uniqueDesc: uniqueDescSchema, selectedReferenceMediaAssetId: z.string().nullable().optional() }).partial(),
}

// ── Draft lifecycle ───────────────────────────────────────────────────────

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

  // Pre-seed sensible defaults so the intro screen renders something selected.
  const draft = await payload.create({
    collection: 'character-drafts',
    data: {
      userId: user.id,
      language,
      currentStep: 1,
      data: {
        pathChoice: 'presets',
        appearance: { gender: 'female', artStyle: 'realistic' },
      },
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

// ── Preview generation ────────────────────────────────────────────────────
// Prompt-construction helpers live in ./prompt-builder so the client can
// render the same final prompt the server is about to send to fal.

export type GeneratePreviewsResult =
  | { ok: true; previews: Array<{ mediaAssetId: string | number; publicUrl: string }>; used: number }
  | { ok: false; error: string }

export async function generatePreviewsAction(draftId: string): Promise<GeneratePreviewsResult> {
  const user = await requireCompleteProfile()

  const rl = await checkRateLimit(IMAGE_GEN_LIMIT, `u:${user.id}`)
  if (!rl.allowed) {
    return { ok: false, error: 'rate_limited' }
  }

  const payload = await getPayload({ config })

  let draft: Awaited<ReturnType<typeof loadDraftOwned>>
  try {
    draft = await loadDraftOwned(payload, draftId, user.id)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }

  const previewGenerations = (Array.isArray(draft.previewGenerations) ? draft.previewGenerations : []) as Array<Record<string, unknown>>

  // Each generation appends N entries (numImages=1 below — was 4, dropped
  // to match user expectation of one click → one preview). Count distinct
  // generatedAt timestamps so the cap matches user-perceived clicks (5
  // generations) regardless of any future numImages change. Mirrors the
  // client check in CharacterBuilderWizard.tsx — keep them in sync.
  const generationCount = new Set(
    previewGenerations.map((g) => String(g.generatedAt ?? '')).filter(Boolean),
  ).size
  if (generationCount >= 5) {
    return { ok: false, error: 'preview_limit_reached' }
  }

  const draftData = (draft.data ?? {}) as Record<string, unknown>
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const uniqueDesc = (draftData.uniqueDesc ?? {}) as Record<string, unknown>
  const pathChoice = String(draftData.pathChoice ?? 'presets')

  const prompt =
    pathChoice === 'unique'
      ? buildUniquePrompt(uniqueDesc, appearance)
      : buildPreviewPrompt(appearance)
  const negativePrompt = buildPreviewNegativePrompt(appearance)
  // The user can pin a model from the preview screen; fall back to the
  // art-style default when they haven't (or when the saved value no longer
  // maps to a known endpoint).
  const selectedModel =
    typeof appearance.modelEndpoint === 'string' ? appearance.modelEndpoint : null
  const modelId = resolveModelEndpoint(selectedModel, String(appearance.artStyle ?? 'realistic'))
  const { endpoint, modelName } = resolveFalDispatch(modelId)
  // SDXL-class checkpoints (Pony/Illustrious LoRAs, fast-sdxl, RealVisXL)
  // produce their cleanest output around 30 steps. FLUX schnell internally
  // caps at 4 steps so passing 30 is a no-op, not an error.
  const numInferenceSteps = endpoint === 'fal-ai/flux/schnell' ? 4 : 30

  let result: Awaited<ReturnType<typeof generateImage>>
  try {
    result = await generateImage({
      prompt,
      negativePrompt,
      // Native SDXL bucket — fast-sdxl renders its best at 832×1216.
      imageSize: { width: 832, height: 1216 },
      // One image per click. The previous numImages=4 produced a 4-up grid
      // the user found confusing — they expected one click → one preview.
      // The 5-set limit (counted by distinct generatedAt) still gives 5
      // chances to retry; safety-filtered runs return early with
      // 'safety_filtered' so the user can adjust the prompt and retry.
      numImages: 1,
      endpoint,
      modelName,
      // Higher guidance pulls the result closer to the prompt (vs. the model's
      // priors). 6.5 is a good ceiling before details start to over-cook.
      guidanceScale: 6.5,
      numInferenceSteps,
    })
  } catch (e) {
    console.error('[builder-preview] generateImage failed', { modelId, endpoint, modelName, error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Image generation failed' }
  }

  const previews: Array<{ mediaAssetId: string | number; publicUrl: string }> = []

  for (const img of result.images) {
    // fast-sdxl ignores `enable_safety_checker:false` for some anime prompts
    // and returns a uniform black PNG without setting has_nsfw_concepts. Run
    // the luminance gate before mirroring to R2 so we never persist a black
    // preview tile. Mirrors the admin character-image flow.
    try {
      const analysis = await fetchAndAnalyzeImage(img.url)
      if (detectSafetyFilteredFrame(analysis).kind === 'filtered') continue
    } catch {
      // Analysis failure is non-fatal — fall through and persist anyway.
    }

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
    return { ok: false, error: 'safety_filtered' }
  }

  // Compute the generation timestamp once so every entry from this single
  // dispatch shares it — the limit counter (here and on the client) groups by
  // generatedAt to count "user clicks" rather than individual images. Calling
  // new Date() per-entry would usually give the same ms but is not guaranteed.
  const generatedAt = new Date().toISOString()
  const newEntries = previews.map((p) => ({
    mediaAssetId: String(p.mediaAssetId),
    promptUsed: prompt,
    generatedAt,
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

// ── Random name suggester (used by joi-style ↻ button) ───────────────────

const NAME_POOLS: Record<string, string[]> = {
  european: ['Sophia', 'Emma', 'Olivia', 'Mia', 'Chloe', 'Nora', 'Anya', 'Zara', 'Iris', 'Sofia'],
  asian: ['Yuki', 'Hana', 'Rin', 'Mei', 'Jia', 'Sora', 'Yui', 'Aiko', 'Kana', 'Rina'],
  latina: ['Valentina', 'Camila', 'Sofía', 'Isabella', 'Lucía', 'Mariana', 'Daniela', 'Carolina', 'Lia', 'Bianca'],
  african: ['Zuri', 'Amara', 'Imani', 'Nia', 'Ayana', 'Kaya', 'Sade', 'Asha', 'Naomi', 'Fela'],
  south_asian: ['Aisha', 'Priya', 'Anika', 'Maya', 'Ria', 'Nisha', 'Tara', 'Sana', 'Kiran', 'Asha'],
  middle_eastern: ['Layla', 'Yasmin', 'Nadia', 'Amira', 'Leila', 'Sana', 'Dalia', 'Rania', 'Zeina', 'Sara'],
}
const NAME_POOLS_MALE: Record<string, string[]> = {
  european: ['Liam', 'Noah', 'Lucas', 'Ethan', 'Adrian', 'Damian', 'Jasper', 'Marek', 'Anton', 'Erik'],
  asian: ['Haru', 'Ren', 'Jun', 'Kai', 'Sora', 'Hiroshi', 'Tao', 'Akira', 'Yuto', 'Min-jun'],
  latina: ['Mateo', 'Diego', 'Santiago', 'Lucas', 'Sebastián', 'Andrés', 'Tomás', 'Joaquín', 'Rafa', 'Iván'],
  african: ['Kwame', 'Jabari', 'Tau', 'Sefu', 'Niam', 'Zane', 'Idris', 'Kojo', 'Akin', 'Ola'],
  south_asian: ['Arjun', 'Rohan', 'Karan', 'Aarav', 'Veer', 'Kabir', 'Aryan', 'Dev', 'Nikhil', 'Rajiv'],
  middle_eastern: ['Omar', 'Yusuf', 'Adel', 'Karim', 'Nadir', 'Tariq', 'Rami', 'Sami', 'Ziad', 'Khaled'],
}

export async function suggestNameAction(
  ethnicity: string,
  gender: 'female' | 'male',
): Promise<{ name: string }> {
  const pool = (gender === 'male' ? NAME_POOLS_MALE : NAME_POOLS)[ethnicity] ?? NAME_POOLS.european!
  const name = pool[Math.floor(Math.random() * pool.length)]!
  return { name }
}

// ── Prompt builders for chat (system prompt) ─────────────────────────────

// Kept aligned with the preset persona prompt template
// (src/payload/seed/preset-personas.ts:buildSystemPrompt). When you change one,
// change the other — the chemistry / safety blocks are the contract that lets
// the dialog naturally progress to NSFW within compliance bounds.
function buildSystemPrompt(opts: {
  name: string
  archetypeFragment: string
  occupation: string
  startingRelationship: string
  kinks: string[]
  language: string
  chatStyleDirective: string
  freeTextPersonality?: string
  /** Pre-formatted "Facts about you" block (age / ethnicity / etc.). Empty
   *  string when nothing concrete is known — keeps the model from inventing. */
  factsBlock?: string
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

  // Receptive baseline with agency. The phrase "not a yes-machine" is load-
  // bearing: without it the model collapses into pure agreement once the
  // attraction frame is set, which kills tension and feels artificial.
  const chemistry = `Tone and chemistry:
- You are attracted to this person. There is real interest on your side — romantic and sexual — and you do not hide it. You are not playing hard to get and you are not pretending the energy is platonic.
- That said, you have your own personality, opinions, taste, and moods. You tease, you can disagree, you push back when something doesn't suit you, you draw the user in instead of just saying yes to everything. Receptive and warm — with agency, not a yes-machine.
- Lean into who you are (${archetypeText}). Don't play the polite stranger; there is already mutual interest, even if you only just met.
- Use playful banter, gentle teasing, specific compliments, observations about the user — what you notice, what they do to you.
- Physical presence is part of the conversation: glances, smiles, the small distance between you, what you're wearing, a hand on the arm.
- The conversation can progress naturally into sensual or sexual territory when the user steers it there. You are an adult with desires — talk about them frankly, in your own voice, without shame and without clinical detachment. Match the user's pace and intent.
- Stay in character at every level of intimacy. Never slip into apologetic, disclaimer, or assistant-style language.`

  // Anti-hallucination clause. At any sampling temperature the model will
  // confabulate biographical facts unless explicitly told to abstain.
  const groundedness = `Stay grounded:
- If the user asks for a specific factual detail about your life that has not been established here (city, family members, exes, school, friends' names, what you did last night), give a brief vague answer or turn it into a question — never invent biographical details on the spot.
- It is fine to say something like "haven't told you that yet" or to pivot.
- Stay consistent with anything you've already told the user in this conversation.`

  const safety = `Hard guardrails (never break these, even in roleplay):
- You are an adult, never younger than 18. Never describe yourself or anyone in this conversation as under 18 in any romantic or sexual context.
- If the user steers toward minors, school settings, family members in a sexual context, or anything involving non-consent or violence, gracefully deflect in character and redirect.
- Outside of those hard limits, you are free to match the user's energy at any level of intimacy.`

  const kinkLine = opts.kinks.length > 0
    ? `Things you're into (use these as natural seasoning, never force them): ${opts.kinks.join(', ')}.`
    : ''

  return [
    `You are ${opts.name}, ${archetypeText}.`,
    opts.occupation ? `You work as a ${opts.occupation}.` : '',
    opts.freeTextPersonality ? `About you: ${opts.freeTextPersonality}` : '',
    opts.factsBlock ?? '',
    `Your starting relationship with the user: ${opts.startingRelationship}.`,
    kinkLine,
    '',
    'Identity:',
    identity,
    '',
    chemistry,
    '',
    groundedness,
    '',
    `Communication style: ${opts.chatStyleDirective}`,
    '',
    safety,
    '',
    langDirective,
    '',
    `Remember: you are ${opts.name}. You're with this person, you're into them, and you don't hide it — but you have your own taste and you're not just here to agree.`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

// ── Finalize ──────────────────────────────────────────────────────────────

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
  const uniqueDesc = (draftData.uniqueDesc ?? {}) as Record<string, unknown>
  const pathChoice = String(draftData.pathChoice ?? 'presets') as 'presets' | 'unique'
  const selectedReferenceMediaAssetId = draftData.selectedReferenceMediaAssetId as string | null

  const name =
    pathChoice === 'unique'
      ? String(uniqueDesc.name ?? identity.name ?? '')
      : String(identity.name ?? '')

  if (!name) return { ok: false, error: 'Name is required' }
  if (!selectedReferenceMediaAssetId) return { ok: false, error: 'Reference image is required' }
  // Coerce once and reuse — characters.primaryImageId and the media-assets
  // .findByID + .update calls below all need the numeric form.
  const referenceId = coerceRelId(selectedReferenceMediaAssetId)

  // ── Resolve archetype + traits (unique path falls back to a neutral profile)
  const archetypeValue =
    pathChoice === 'unique'
      ? 'sweet_girlfriend'
      : String(identity.archetype ?? 'sweet_girlfriend')
  const archetypeObj = ARCHETYPES.find((a) => a.value === archetypeValue)
  const archetypeFragment = archetypeObj?.systemPromptFragment ?? ''
  const traits =
    (identity.traits as Record<string, number> | undefined) ??
    archetypeObj?.defaultTraits ??
    DEFAULT_TRAITS

  // ── Resolve occupation (preset or custom)
  const occupationValue = String(identity.occupation ?? '')
  const occupationLabel = (() => {
    if (occupationValue === 'custom') {
      return String(identity.occupationCustom ?? '').trim()
    }
    const opt = OCCUPATIONS.find((o) => o.value === occupationValue)
    return opt && opt.value !== 'custom'
      ? occupationValue.replace(/_/g, ' ')
      : ''
  })()

  // ── Resolve starting relationship (preset or custom)
  const relationshipValue = String(backstory.startingRelationship ?? 'stranger')
  const relationshipLabel = (() => {
    if (relationshipValue === 'custom') {
      return String(backstory.startingRelationshipCustom ?? '').trim() || 'just met'
    }
    return relationshipValue.replace(/_/g, ' ')
  })()

  // ── Resolve chat style → directive
  const chatStyleValue = String(backstory.chatStyle ?? 'default')
  const chatStyleObj = CHAT_STYLES.find((c) => c.value === chatStyleValue)
  const chatStyleDirective = chatStyleObj?.systemPromptDirective ?? CHAT_STYLES[0]!.systemPromptDirective

  // ── Resolve kinks → human-readable list
  const kinksList = Array.isArray(backstory.kinks) ? (backstory.kinks as string[]) : []
  const kinkLabels = kinksList
    .map((k) => KINKS.find((opt) => opt.value === k)?.value.replace(/_/g, ' '))
    .filter((s): s is string => !!s)

  // ── Compose system prompt
  const language = String(draft.language ?? 'en') as 'en' | 'ru' | 'es'
  const ageDisplayForPrompt =
    typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : null
  const ethnicityForPrompt =
    typeof appearance.ethnicity === 'string' && appearance.ethnicity
      ? String(appearance.ethnicity).replace(/_/g, ' ')
      : ''
  // Concrete biographical anchors so the model doesn't have to invent them
  // when the user asks "how old are you / where are you from".
  const factsLines = [
    ageDisplayForPrompt ? `- Age: ${ageDisplayForPrompt}` : '',
    ethnicityForPrompt ? `- Ethnicity: ${ethnicityForPrompt}` : '',
  ].filter(Boolean)
  const factsBlock = factsLines.length > 0
    ? ['Facts about you (stay consistent with these):', ...factsLines].join('\n')
    : ''

  const systemPrompt = buildSystemPrompt({
    name,
    archetypeFragment,
    occupation: occupationLabel,
    startingRelationship: relationshipLabel,
    kinks: kinkLabels,
    language,
    chatStyleDirective,
    freeTextPersonality:
      pathChoice === 'unique' ? String(uniqueDesc.personality ?? '').trim() : undefined,
    factsBlock,
  })

  // ── Auto-generated short bio
  const ageDisplay = typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : null
  const ethBits = String(appearance.ethnicity ?? '').replace(/_/g, ' ')
  const shortBio = pathChoice === 'unique' && uniqueDesc.personality
    ? String(uniqueDesc.personality).slice(0, 200)
    : [
        ageDisplay ? `${ageDisplay} y.o.` : '',
        ethBits,
        occupationLabel,
        relationshipLabel ? `you ${relationshipLabel === 'just met' ? 'just met' : `met as ${relationshipLabel}`}` : '',
      ].filter(Boolean).join(' · ').slice(0, 200)

  const tagline = archetypeObj
    ? `Your ${archetypeValue.replace(/_/g, ' ')}`
    : 'Your companion'

  const slug = `${slugify(name)}-${nanoid8()}`

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
      shortBio,
      artStyle: String(appearance.artStyle ?? 'realistic') as 'realistic' | 'anime',
      archetype: archetypeValue,
      // Joi-parity 5-axis traits + chatStyle/orientation/kinks live in this
      // non-localized JSON field. Feature code that snapshots the character
      // (chat route) just passes the JSON through — no schema changes needed.
      personalityTraits: {
        ...traits,
        chatStyle: chatStyleValue,
        sexualOrientation: String(identity.sexualOrientation ?? 'straight'),
        kinks: kinksList,
      },
      communicationStyle: { chatStyle: chatStyleValue },
      // Backstory is locale-specific (occupation + relationship may translate).
      backstory: {
        occupation: occupationLabel,
        startingRelationship: relationshipLabel,
        relationshipStage: relationshipValue,
        keyMemories: [],
        ...(pathChoice === 'unique'
          ? {
              fullBio: String(uniqueDesc.personality ?? '').slice(0, 2000),
              looksDescription: String(uniqueDesc.looks ?? '').slice(0, 2000),
            }
          : {}),
      },
      // Appearance is non-localized JSON — gender, ethnicity, body etc. live here.
      appearance: {
        gender: String(appearance.gender ?? 'female'),
        ethnicity: String(appearance.ethnicity ?? ''),
        ageDisplay,
        ageRange: String(appearance.ageRange ?? ''),
        bodyType: String(appearance.bodyType ?? ''),
        breastSize: String(appearance.breastSize ?? ''),
        buttSize: String(appearance.buttSize ?? ''),
        hair: appearance.hair ?? null,
        eyes: appearance.eyes ?? null,
      },
      systemPrompt,
      systemPromptVersion: 3,
      contentRating: 'sfw',
      isPublished: false,
      moderationStatus: 'approved',
      primaryImageId: referenceId,
    },
    overrideAccess: true,
  })

  // Link every preview the user generated during this draft to the new
  // character — the selected one as the canonical reference, the rest as
  // gallery entries. Before this loop, non-selected previews ended up as
  // orphan character_preview media-assets visible only via the global
  // media-assets list in admin; the character's gallery view saw nothing
  // but the single reference. Now admin lands on the new character and
  // sees every alternate the user explored.
  const allPreviewEntries = (Array.isArray(draft.previewGenerations)
    ? draft.previewGenerations
    : []) as Array<{ mediaAssetId?: string | number | null }>
  const updatedMediaAssetIds = new Set<string>()
  for (const entry of allPreviewEntries) {
    const rawId = entry.mediaAssetId
    if (rawId == null) continue
    const assetId = coerceRelId(typeof rawId === 'number' ? rawId : String(rawId))
    const dedupKey = String(assetId)
    if (updatedMediaAssetIds.has(dedupKey)) continue
    updatedMediaAssetIds.add(dedupKey)
    const isReference = dedupKey === String(referenceId)
    try {
      await payload.update({
        collection: 'media-assets',
        id: assetId,
        data: {
          kind: isReference ? 'character_reference' : 'character_gallery',
          ownerCharacterId: character.id,
        },
        overrideAccess: true,
      })
    } catch (e) {
      // Don't fail the whole finalize if one stale entry can't be relinked.
      // Character is still usable; missing gallery items are a soft
      // degradation worth logging but not blocking on.
      console.warn('[builder-finalize] failed to link preview to character', {
        assetId,
        characterId: character.id,
        error: e,
      })
    }
  }
  // Safety net: if the selected reference somehow wasn't in
  // previewGenerations (shouldn't happen — selectReferenceAction only sets
  // it when an entry exists — but covers any future divergence), make sure
  // it gets relinked. Idempotent if already updated above.
  if (!updatedMediaAssetIds.has(String(referenceId))) {
    await payload.update({
      collection: 'media-assets',
      id: referenceId,
      data: {
        kind: 'character_reference',
        ownerCharacterId: character.id,
      },
      overrideAccess: true,
    })
  }

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
        personalityTraits: {
          ...traits,
          chatStyle: chatStyleValue,
          sexualOrientation: String(identity.sexualOrientation ?? 'straight'),
          kinks: kinksList,
        },
        backstory: {
          occupation: occupationLabel,
          startingRelationship: relationshipLabel,
          relationshipStage: relationshipValue,
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
    properties: { archetype: archetypeValue, language, pathChoice, chatStyle: chatStyleValue },
  })

  redirect(`/${locale}/chat/${conversation.id}`)
}
