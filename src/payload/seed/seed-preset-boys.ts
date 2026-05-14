import type { Payload } from 'payload'
import {
  BOYS,
  buildBoySystemPrompt,
  buildMaleAppearance,
  type BoyPersona,
  type Language,
} from './preset-boys'

const LANGUAGES: Language[] = ['en', 'ru', 'es']

function buildDocData(persona: BoyPersona, language: Language) {
  const { core } = persona
  const variant = persona.variants[language]
  return {
    kind: 'preset' as const,
    category: 'boys' as const,
    slug: core.slug,
    archetype: core.archetype,
    artStyle: core.artStyle,
    contentRating: core.contentRating,
    isPublished: true,
    moderationStatus: 'approved' as const,
    tags: core.tags,
    personalityTraits: core.personalityTraits,
    appearance: buildMaleAppearance(core.appearance, core.artStyle),
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
    systemPrompt: buildBoySystemPrompt(persona, language),
    communicationStyle: {
      formality: 'casual',
      messageLength: 'medium',
      emojiUsage: 'occasional',
      petNamesForUser: variant.petNamesForUser,
      languageMixing: false,
    },
    backstory: {
      age: core.appearance.age,
      occupation: core.occupation[language],
      city: core.city,
      interests: core.interests[language],
      relationshipStage: core.relationshipStage,
    },
  }
}

async function upsertBoy(payload: Payload, persona: BoyPersona): Promise<void> {
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
    payload.logger.info(`[seed:boys] Created ${core.slug}`)
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
  payload.logger.info(`[seed:boys] Updated ${core.slug}`)
}

export async function seedPresetBoys(payload: Payload): Promise<void> {
  for (const persona of BOYS) {
    await upsertBoy(payload, persona)
  }
  payload.logger.info(`[seed:boys] Done — ${BOYS.length} boy personas × 3 locales.`)
}
