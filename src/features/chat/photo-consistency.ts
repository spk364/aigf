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
  // ru — cover neuter/instrumental/genitive forms too ("голое фото", "голым",
  // "голого"); the bare list previously only had feminine голая/голую/голой, so
  // the very common "пришли голое фото" slipped through undetected.
  'голая', 'голую', 'голой', 'голое', 'голым', 'голого', 'голышом',
  'обнажён', 'обнажен', 'обнажённая', 'обнаженная', 'обнажённой', 'обнаженной',
  'без лифчика', 'без бюстгальтера',
  'без трусиков', 'без белья', 'без одежды', 'голые сиськи', 'сиськи', 'грудь обнаж',
  'соски', 'разденься', 'раздевайся', 'раздет', 'покажи свои',
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

// Photo-request imperatives embedded in a scene ("…, send me your full naked
// photo"). Image models read these as a request, not a depiction, so a buried
// "naked" leaves the subject clothed. Strip them; the nudity intent is recovered
// separately by explicitNudityTokens before stripping.
const EMBEDDED_PHOTO_IMPERATIVE =
  /\b(?:please\s+)?(?:can|could|would|will)?\s*(?:you\s+)?(?:send|show|share|take|snap|give)\s+(?:me\s+)?(?:your\s+|a\s+|an\s+)?(?:full\s+|fully\s+)?(?:naked\s+|nude\s+)?(?:photos?|pics?|pictures?|selfies?|images?)\b/gi

export function stripPhotoImperatives(scene: string | null | undefined): string {
  if (!scene) return ''
  return scene
    .replace(EMBEDDED_PHOTO_IMPERATIVE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*,\s*,/g, ', ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim()
}

// Turn an explicit request into clean depiction tokens the image model will
// actually render — "send me your full naked photo" → "completely nude, fully
// naked, …". Full nudity wins over partial; otherwise emit the specific parts.
export function explicitNudityTokens(text: string | null | undefined): string {
  const t = (text ?? '').toLowerCase()
  const fullNude =
    /\b(?:fully|full|completely|totally)\s+(?:naked|nude)\b/.test(t) ||
    // Bare "naked/nude" means full nudity — UNLESS it's bound to a body part
    // ("naked breast", "nude chest"), which is a topless cue, not a strip-it-all
    // instruction. Without this exclusion "in stockings, naked breast" added
    // "completely nude, no clothing" and the model dropped the stockings.
    /\b(?:naked|nude|nudes)\b(?!\s*(?:breasts?|boobs?|tits?|chest|nipples?))/.test(t) ||
    /\bno\s+clothes\b/.test(t) ||
    /\bwithout\s+clothes\b/.test(t) ||
    /\bundress(?:ed)?\b/.test(t) ||
    /голая|голую|голой|голое|голым|голого|голышом|обнаж|раздет|раздева|desnud/.test(t)
  if (fullNude) return 'completely nude, fully naked, no clothing, bare skin'

  const parts: string[] = []
  const topless =
    /\btopless\b/.test(t) ||
    /\bno\s+bra\b/.test(t) ||
    /\b(?:bare|naked|exposed)\s+(?:tits?|breasts?|boobs?|chest)\b/.test(t) ||
    /\bnipples?\b/.test(t) ||
    /сиськи|соски|без\s+лифчика|без\s+бюстг|tetas|pezones/.test(t)
  const bottomless =
    /\bbottomless\b/.test(t) ||
    /\bno\s+(?:panties|underwear)\b/.test(t) ||
    /\b(?:pussy|vagina)\b/.test(t) ||
    /без\s+трусиков|без\s+белья|sin\s+bragas/.test(t)
  if (topless) parts.push('topless, bare breasts, exposed nipples')
  if (bottomless) parts.push('bottomless, no underwear')
  return parts.join(', ')
}

/**
 * Build the final scene string for an explicit photo: drop embedded request
 * imperatives and fold in clean nudity depiction tokens. Returns the scene
 * unchanged when not explicit.
 */
export function resolveExplicitScene(args: {
  scene: string
  message: string
  explicit: boolean
}): string {
  if (!args.explicit) return args.scene
  const nudity = explicitNudityTokens(`${args.scene} ${args.message}`)
  const cleaned = stripPhotoImperatives(args.scene)
  return [cleaned, nudity].filter(Boolean).join(', ')
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
  // en — generic assistant-style "I won't comply" refusals. DeepSeek (and
  // whatever OpenRouter routes to) sometimes drops the in-character voice and
  // emits a canned policy refusal next to the photo we're already sending.
  // These phrases never appear in a willing caption, so matching them is safe.
  "can't comply", 'cannot comply', 'comply with this', "can't fulfill", 'cannot fulfill',
  "can't fulfil", "can't provide", 'cannot provide', "can't assist with", 'cannot assist with',
  "can't help with that", "i'm not able to", 'i am not able to', 'i must decline',
  'have to decline', 'against my guidelines', 'respectful and appropriate',
  'keep interactions respectful', 'keep things respectful', 'keep it respectful',
  'not appropriate', 'inappropriate request',
  // ru
  'предпочитаю сохран', 'загадочност', 'может, лучше поговорим', 'может лучше поговорим',
  'давай лучше', 'не могу отправ', 'не сейчас', 'может быть позже',
  'как-нибудь в другой раз', 'лучше расскаж',
  // ru — generic refusals
  'не могу выполнить', 'не могу этого сделать', 'не могу помочь с этим', 'это неуместно',
  'неуместн', 'вынужден отказать', 'вынуждена отказать',
  // es
  'un poco de misterio', 'algo de misterio', 'mejor hablemos',
  'no puedo enviar', 'quizás más tarde', 'tal vez más tarde', 'preferiría',
  'en otro momento', 'mejor te cuento',
  // es — generic refusals
  'no puedo cumplir', 'no puedo hacer eso', 'no puedo ayudar con eso',
  'no es apropiado', 'no es apropiada', 'debo rechazar',
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
