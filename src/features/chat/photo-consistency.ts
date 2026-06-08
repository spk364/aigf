// Keeps a sent photo and the character's words consistent.
//
// The chat route decides to send a photo whenever the user explicitly asked and
// can pay — independently of what the LLM wrote. DeepSeek, under a strong
// in-character system prompt, sometimes still refuses or deflects in the visible
// text ("I prefer to keep some mystery…") even while we charge the user and
// generate the image. That produces a refusal bubble next to a real photo.
//
// Two helpers below:
//   - isExplicitPhotoScene: detects explicit-nudity requests so the route can
//     pick an NSFW-strong model instead of FLUX (which black-frames nudity).
//   - looksLikePhotoRefusal / photoSendCaption: a deterministic backstop —
//     when we ARE sending a paid photo but the reply reads like a refusal, swap
//     in a short willing caption so words and image agree.

// Explicit-nudity markers across EN/RU/ES. Deliberately about bare skin /
// nudity, NOT mere spice (lingerie/swimwear stay on the fast FLUX path).
const EXPLICIT_MARKERS: string[] = [
  // en
  'naked', 'nude', 'nudes', 'topless', 'bottomless', 'no bra', 'no panties',
  'no underwear', 'bare breast', 'bare boobs', 'bare tits', 'tits', 'boobs out',
  'nipple', 'areola', 'pussy', 'vagina', 'cum', 'spread legs', 'legs spread',
  'fully naked', 'completely naked', 'undressed', 'undress', 'take off your',
  'without clothes', 'no clothes', 'show me your',
  // ru
  'голая', 'голую', 'голой', 'обнажён', 'обнажен', 'без лифчика', 'без бюстгальтера',
  'без трусиков', 'без белья', 'без одежды', 'голые сиськи', 'сиськи', 'грудь обнаж',
  'соски', 'разденься', 'раздет', 'покажи свои',
  // es
  'desnuda', 'desnudo', 'sin sujetador', 'sin ropa', 'sin bragas', 'tetas',
  'pechos desnudos', 'pezones', 'enséñame tus', 'muéstrame tus', 'quítate',
]

// Match a marker as a whole word for ASCII markers (so "undress" doesn't fire
// on "sundress", nor "tits" on "titshirt"). Non-ASCII markers (Cyrillic) where
// JS word boundaries are unreliable fall back to substring — they're distinctive
// enough that mid-word collisions don't occur in practice.
function containsMarker(haystack: string, marker: string): boolean {
  if (/^[a-z0-9 ']+$/.test(marker)) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i').test(haystack)
  }
  return haystack.includes(marker)
}

export function isExplicitPhotoScene(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return EXPLICIT_MARKERS.some((m) => containsMarker(lower, m))
}

// Refusal / deflection markers. Conservative on purpose — these are phrases a
// flirty caption would not normally contain, so a real "here you go" reply is
// left untouched. Matching any one while a photo is attached triggers the swap.
const REFUSAL_MARKERS: string[] = [
  // en — clear deflections only; avoid ambiguous phrases a willing caption
  // might contain ("instead", "how about we …" can be flirty).
  'prefer to keep', 'keep some mystery', 'keep a little mystery', 'bit of mystery',
  'maybe later', 'maybe another time', 'maybe some other time', 'not right now',
  'rather not', "i'd rather", "can't send", 'cannot send', "can't do that",
  'not comfortable', 'prefer not to', "let's talk about", 'how about we talk',
  // ru
  'предпочитаю сохран', 'загадочност', 'может, лучше поговорим', 'может лучше поговорим',
  'давай лучше', 'не могу отправ', 'не сейчас', 'может быть позже',
  'как-нибудь в другой раз', 'лучше расскаж',
  // es
  'un poco de misterio', 'algo de misterio', 'mejor hablemos',
  'no puedo enviar', 'quizás más tarde', 'tal vez más tarde', 'preferiría',
  'en otro momento', 'mejor te cuento',
]

export function looksLikePhotoRefusal(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return REFUSAL_MARKERS.some((m) => lower.includes(m))
}

// Short, willing captions to attach to the photo when we had to drop a refusal.
// A few variants per locale so it doesn't read robotically across a session.
const CAPTIONS: Record<string, string[]> = {
  en: ['Here you go… 😏', 'Just for you 😘', 'Hope you like it… 😏', 'All yours 😘'],
  ru: ['Вот, держи… 😏', 'Только для тебя 😘', 'Надеюсь, понравится… 😏', 'Это тебе 😘'],
  es: ['Aquí tienes… 😏', 'Solo para ti 😘', 'Espero que te guste… 😏', 'Toda tuya 😘'],
}

// Deterministic pick (no Math.random so it's stable for a given seed) — caller
// passes a varying integer (e.g. message id) so successive photos differ.
export function photoSendCaption(locale: string, seed: number): string {
  const list = CAPTIONS[locale] ?? CAPTIONS.en!
  const idx = Math.abs(Math.trunc(seed)) % list.length
  return list[idx]!
}
