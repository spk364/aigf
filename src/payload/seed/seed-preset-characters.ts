import type { Payload } from 'payload'
import { PERSONAS, buildSystemPrompt, type Persona, type Language } from './preset-personas'
import { EXTRA_PERSONAS } from './preset-personas-extra'
import { buildAppearanceFromParams } from '@/shared/ai/appearance-prompt'

const ALL_PERSONAS: Persona[] = [...PERSONAS, ...EXTRA_PERSONAS]

const LANGUAGES: Language[] = ['en', 'ru', 'es']

function buildDocData(persona: Persona, language: Language) {
  const { core } = persona
  const variant = persona.variants[language]
  return {
    kind: 'preset' as const,
    category: (core.artStyle === 'anime' ? 'anime' : 'girls') as 'anime' | 'girls',
    slug: core.slug,
    archetype: core.archetype,
    artStyle: core.artStyle,
    contentRating: core.contentRating,
    isPublished: true,
    moderationStatus: 'approved' as const,
    tags: core.tags,
    personalityTraits: core.personalityTraits,
    appearance: buildAppearanceFromParams(core.appearance, core.artStyle),
    ...(core.referenceImageUrl ? { referenceImageUrl: core.referenceImageUrl } : {}),
    imageModel: {
      primary: core.artStyle === 'anime' ? 'fal-ai/fast-sdxl' : 'fal-ai/realistic-vision',
    },
    displayOrder: core.displayOrder,
    featured: true,
    landingFeatured: true,
    landingOrder: core.landingOrder,
    // localized
    name: variant.name,
    tagline: variant.tagline,
    shortBio: variant.shortBio,
    systemPrompt: buildSystemPrompt(persona, language),
    communicationStyle: {
      formality: 'casual',
      messageLength: 'medium',
      emojiUsage: 'occasional',
      petNamesForUser: variant.petNamesForUser,
      languageMixing: false,
    },
    backstory: {
      age: core.age,
      occupation: core.occupation[language],
      city: core.city,
      interests: core.interests[language],
      relationshipStage: core.relationshipStage,
    },
  }
}

async function upsertPersona(payload: Payload, persona: Persona): Promise<void> {
  const { core } = persona

  const existing = await payload.find({
    collection: 'characters',
    where: { slug: { equals: core.slug } },
    limit: 1,
  })

  if (existing.docs.length === 0) {
    const doc = await payload.create({
      collection: 'characters',
      locale: 'en',
      data: buildDocData(persona, 'en'),
    })
    for (const lang of ['ru', 'es'] as Language[]) {
      await payload.update({
        collection: 'characters',
        id: doc.id,
        locale: lang,
        data: buildDocData(persona, lang),
      })
    }
    payload.logger.info(`[seed] Created ${core.slug}`)
    return
  }

  const docId = existing.docs[0]!.id
  for (const lang of LANGUAGES) {
    await payload.update({
      collection: 'characters',
      id: docId,
      locale: lang,
      data: buildDocData(persona, lang),
    })
  }
  payload.logger.info(`[seed] Updated ${core.slug}`)
}

export async function seedPresetCharacters(payload: Payload): Promise<void> {
  for (const persona of ALL_PERSONAS) {
    await upsertPersona(payload, persona)
  }
  payload.logger.info(`[seed] Done — ${ALL_PERSONAS.length} personas × 3 locales.`)
}

// Seeds ONLY the additional personas (preset-personas-extra.ts), leaving the
// base catalog untouched — so adding new characters to a live deployment can't
// overwrite curation/edits on the existing ones.
export async function seedExtraCharacters(payload: Payload): Promise<void> {
  for (const persona of EXTRA_PERSONAS) {
    await upsertPersona(payload, persona)
  }
  payload.logger.info(`[seed] Done — ${EXTRA_PERSONAS.length} extra personas × 3 locales.`)
}
