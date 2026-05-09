// Curated voice catalog for character creation.
//
// MVP keeps this list small and opinionated rather than exposing the full
// MiniMax library (300+ voices). Each entry maps to a MiniMax pre-built
// `voice_id` and carries metadata for the picker UI: localized labels,
// gender, vibe, and a short preview clip stored in R2 (seeded by
// scripts/seed-voice-previews.ts).
//
// Adding a voice: add an entry here, run the seed script to populate the
// R2 preview clip, and the new voice appears in admin + create flows.

export type VoiceGender = 'female' | 'male'
export type VoiceVibe = 'sweet' | 'sultry' | 'playful' | 'confident' | 'warm' | 'cool'

export type VoiceLocalized = {
  en: string
  ru: string
  es: string
}

export type VoiceCatalogEntry = {
  // Stable identifier we store on `characters.voiceId` and use as the seed
  // namespace for preview clips. Keep snake_case + ASCII so it survives URL
  // encoding without escaping.
  id: string
  // The MiniMax `voice_id` we send to fal — separate from `id` so we can
  // remap to a different upstream voice without breaking stored character
  // configs.
  providerVoiceId: string
  // The TTS endpoint that hosts this voice. Currently MiniMax only.
  endpoint: 'fal-ai/minimax/speech-02-hd'
  gender: VoiceGender
  vibe: VoiceVibe
  // Localized display labels for the picker.
  label: VoiceLocalized
  // Short (one-line) description shown under the label.
  blurb: VoiceLocalized
  // Preview clip text used by the seed script. Each locale gets its own clip.
  previewText: VoiceLocalized
}

// 8 voices: 4 female × 4 male, each with a distinct vibe. MiniMax voice ids
// are taken from their pre-built voice library — names like "Wise_Woman",
// "Friendly_Person" come from MiniMax docs.
export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: 'sweet_girl',
    providerVoiceId: 'Sweet_Girl_2',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'female',
    vibe: 'sweet',
    label: { en: 'Sweet', ru: 'Нежная', es: 'Dulce' },
    blurb: {
      en: 'Soft, caring, gentle pace',
      ru: 'Мягкая, заботливая, спокойная',
      es: 'Suave, cariñosa, pausada',
    },
    previewText: {
      en: "Hi, I'm so glad you're here. Stay with me a little while?",
      ru: 'Привет, я так рада, что ты здесь. Останешься со мной ненадолго?',
      es: 'Hola, me alegra mucho verte. ¿Te quedas un rato conmigo?',
    },
  },
  {
    id: 'sultry_woman',
    providerVoiceId: 'Wise_Woman',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'female',
    vibe: 'sultry',
    label: { en: 'Sultry', ru: 'Чувственная', es: 'Sensual' },
    blurb: {
      en: 'Low, smoky, deliberate',
      ru: 'Низкая, тягучая, уверенная',
      es: 'Grave, ahumada, deliberada',
    },
    previewText: {
      en: "I've been waiting for you. Come closer, tell me everything.",
      ru: 'Я ждала тебя. Подойди ближе, расскажи мне всё.',
      es: 'Te estaba esperando. Acércate, cuéntamelo todo.',
    },
  },
  {
    id: 'playful_girl',
    providerVoiceId: 'Lively_Girl',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'female',
    vibe: 'playful',
    label: { en: 'Playful', ru: 'Игривая', es: 'Juguetona' },
    blurb: {
      en: 'Bright, teasing, full of energy',
      ru: 'Звонкая, дразнящая, энергичная',
      es: 'Luminosa, traviesa, llena de energía',
    },
    previewText: {
      en: "Hey, you! Took you long enough. What are we getting into today?",
      ru: 'Эй, ты! Долго же тебя не было. Чем сегодня займёмся?',
      es: '¡Eh, tú! Cuánto tardaste. ¿Qué travesura hacemos hoy?',
    },
  },
  {
    id: 'confident_woman',
    providerVoiceId: 'Inspirational_girl',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'female',
    vibe: 'confident',
    label: { en: 'Confident', ru: 'Уверенная', es: 'Segura' },
    blurb: {
      en: 'Direct, magnetic, in control',
      ru: 'Прямая, магнетичная, властная',
      es: 'Directa, magnética, al mando',
    },
    previewText: {
      en: "Glad you made it. Let's not waste time — I have plans for us.",
      ru: 'Хорошо, что ты пришёл. Не будем терять время — у меня на нас планы.',
      es: 'Me alegra que vinieras. No perdamos tiempo: tengo planes para nosotros.',
    },
  },
  {
    id: 'warm_man',
    providerVoiceId: 'Friendly_Person',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'male',
    vibe: 'warm',
    label: { en: 'Warm', ru: 'Тёплый', es: 'Cálido' },
    blurb: {
      en: 'Friendly, attentive, easy presence',
      ru: 'Дружелюбный, внимательный, лёгкий',
      es: 'Amable, atento, agradable',
    },
    previewText: {
      en: "Hey there. I'm really happy to see you — how was your day?",
      ru: 'Привет. Я правда рад тебя видеть. Как прошёл день?',
      es: 'Hola. Me alegra mucho verte. ¿Qué tal tu día?',
    },
  },
  {
    id: 'deep_man',
    providerVoiceId: 'Deep_Voice_Man',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'male',
    vibe: 'sultry',
    label: { en: 'Deep', ru: 'Глубокий', es: 'Profundo' },
    blurb: {
      en: 'Low register, slow, grounding',
      ru: 'Низкий, медленный, обволакивающий',
      es: 'Registro grave, lento, envolvente',
    },
    previewText: {
      en: "Come here. Sit down. I want to listen to you for a while.",
      ru: 'Иди сюда. Садись. Я хочу тебя послушать.',
      es: 'Ven aquí. Siéntate. Quiero escucharte un rato.',
    },
  },
  {
    id: 'playful_man',
    providerVoiceId: 'Casual_Guy',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'male',
    vibe: 'playful',
    label: { en: 'Playful', ru: 'Игривый', es: 'Juguetón' },
    blurb: {
      en: 'Cheeky, light, quick on the punchline',
      ru: 'Дерзкий, лёгкий, остроумный',
      es: 'Travieso, ligero, ocurrente',
    },
    previewText: {
      en: "Look who showed up. Miss me? Come on, admit it.",
      ru: 'Смотри, кто пришёл. Скучал? Ну, признайся.',
      es: 'Mira quién apareció. ¿Me extrañaste? Vamos, admítelo.',
    },
  },
  {
    id: 'confident_man',
    providerVoiceId: 'Patient_Man',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    gender: 'male',
    vibe: 'confident',
    label: { en: 'Confident', ru: 'Уверенный', es: 'Seguro' },
    blurb: {
      en: 'Steady, decisive, takes the lead',
      ru: 'Ровный, решительный, ведущий',
      es: 'Firme, decidido, lleva la voz',
    },
    previewText: {
      en: "I've been thinking about you. Tell me — what do you want tonight?",
      ru: 'Я думал о тебе. Скажи — чего ты хочешь сегодня?',
      es: 'Estuve pensando en ti. Dime: ¿qué quieres esta noche?',
    },
  },
]

export const DEFAULT_VOICE_ID = 'sweet_girl'

export type VoiceLocale = 'en' | 'ru' | 'es'

export function findVoiceById(id: string): VoiceCatalogEntry | undefined {
  return VOICE_CATALOG.find((v) => v.id === id)
}

export function getVoicesByGender(gender: VoiceGender): VoiceCatalogEntry[] {
  return VOICE_CATALOG.filter((v) => v.gender === gender)
}

// Public-facing voice payload — strips internal upstream identifiers and
// returns only what the picker UI needs.
export type VoicePublicEntry = {
  id: string
  gender: VoiceGender
  vibe: VoiceVibe
  label: string
  blurb: string
  previewUrl: string | null
}

export function toPublicVoice(
  entry: VoiceCatalogEntry,
  locale: VoiceLocale,
  previewUrl: string | null,
): VoicePublicEntry {
  return {
    id: entry.id,
    gender: entry.gender,
    vibe: entry.vibe,
    label: entry.label[locale],
    blurb: entry.blurb[locale],
    previewUrl,
  }
}
