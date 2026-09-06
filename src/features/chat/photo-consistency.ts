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

import type { SubjectGender } from '@/shared/ai/subject-gender'

// Explicit-nudity markers across EN/RU/ES. Deliberately about bare skin /
// nudity, NOT mere spice (lingerie/swimwear stay on the fast FLUX path).
// Male-coded markers are listed alongside the female ones — the list used to be
// female-only, so "shirtless" / "покажи член" never reached the explicit path
// and a male character's nude request was built as an ordinary clothed scene.
const EXPLICIT_MARKERS: string[] = [
  // en
  'naked', 'nude', 'nudes', 'topless', 'bottomless', 'no bra', 'no panties',
  'no underwear', 'bare breast', 'bare boobs', 'bare tits', 'tits', 'boobs out',
  'nipple', 'areola', 'pussy', 'vagina', 'cum', 'spread legs', 'legs spread',
  'fully naked', 'completely naked', 'undressed', 'undress', 'take off your',
  'without clothes', 'no clothes', 'show me your', 'take it off', 'take them off',
  // en — male
  'shirtless', 'bare chest', 'bare torso', 'no shirt', 'no pants', 'penis',
  'dick', 'cock', 'hard on', 'erection',
  // ru — cover neuter/instrumental/genitive forms too ("голое фото", "голым",
  // "голого"); the bare list previously only had feminine голая/голую/голой, so
  // the very common "пришли голое фото" slipped through undetected.
  'голая', 'голую', 'голой', 'голое', 'голым', 'голого', 'голышом',
  'обнажён', 'обнажен', 'обнажённая', 'обнаженная', 'обнажённой', 'обнаженной',
  'без лифчика', 'без бюстгальтера',
  'без трусиков', 'без белья', 'без одежды', 'голые сиськи', 'сиськи', 'грудь обнаж',
  'соски', 'разденься', 'раздевайся', 'раздет', 'покажи свои', 'сними всё', 'сними все',
  // ru — male
  'без рубашки', 'без футболки', 'без штанов', 'голый торс', 'член', 'стояк',
  // es
  'desnuda', 'desnudo', 'sin sujetador', 'sin ropa', 'sin bragas', 'tetas',
  'pechos desnudos', 'pezones', 'enséñame tus', 'muéstrame tus', 'quítate',
  // es — male
  'sin camisa', 'sin camiseta', 'sin pantalones', 'torso desnudo', 'pene', 'polla',
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
// `gender` picks the anatomy words: a male "topless" request rendered with
// "bare breasts, exposed nipples" comes back feminised, and the male-specific
// phrasings ("shirtless", "без рубашки") only count as topless for a man.
export function explicitNudityTokens(
  text: string | null | undefined,
  gender: SubjectGender = 'female',
): string {
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
  const isMale = gender === 'male'
  if (fullNude) {
    return isMale
      ? 'completely nude, fully naked, no clothing, bare skin, nude male body, ' +
          'bare chest, visible penis'
      : 'completely nude, fully naked, no clothing, bare skin'
  }

  const parts: string[] = []
  const topless =
    /\btopless\b/.test(t) ||
    /\bno\s+bra\b/.test(t) ||
    /\b(?:bare|naked|exposed)\s+(?:tits?|breasts?|boobs?|chest|torso)\b/.test(t) ||
    /\bnipples?\b/.test(t) ||
    /сиськи|соски|без\s+лифчика|без\s+бюстг|tetas|pezones/.test(t) ||
    (isMale &&
      (/\bshirtless\b/.test(t) ||
        /\bno\s+shirt\b/.test(t) ||
        /без\s+рубашки|без\s+футболки|голый\s+торс|sin\s+camisa|sin\s+camiseta|torso\s+desnudo/.test(
          t,
        )))
  const bottomless =
    /\bbottomless\b/.test(t) ||
    /\bno\s+(?:panties|underwear|pants)\b/.test(t) ||
    /\b(?:pussy|vagina|penis|dick|cock)\b/.test(t) ||
    /без\s+трусиков|без\s+белья|без\s+штанов|член|sin\s+bragas|sin\s+pantalones|pene|polla/.test(t)
  if (topless) {
    parts.push(
      isMale ? 'shirtless, bare chest, bare torso' : 'topless, bare breasts, exposed nipples',
    )
  }
  if (bottomless) {
    parts.push(isMale ? 'bottomless, no underwear, visible penis' : 'bottomless, no underwear')
  }
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
  gender?: SubjectGender
}): string {
  if (!args.explicit) return args.scene
  const nudity = explicitNudityTokens(`${args.scene} ${args.message}`, args.gender)
  const cleaned = stripPhotoImperatives(args.scene)
  return joinUniqueTokens(cleaned, nudity)
}

/**
 * Join two comma-separated token lists, dropping tokens the first list already
 * carries. The user's own words routinely include the words we then add back
 * ("…, fully naked" + "completely nude, fully naked, …"), and a scene that says
 * "fully naked" twice and "bare chest" three times dilutes every token in it —
 * the one that matters ("penis") ends up as 1 of ~20 near-duplicates.
 */
export function joinUniqueTokens(...lists: Array<string | null | undefined>): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const token of (list ?? '').split(',')) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out.join(', ')
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
  return pickCaption(CAPTIONS, locale, seed)
}

// The inverse case: the model replied with the photo directive and NOTHING else,
// but the photo is not going out (the user's message gave no photo signal, or
// the output filter cancelled it). Stripping the directive leaves an empty
// reply, and committing that answered the user with silence — which reads as a
// failed turn. These lines keep the turn alive and nudge the user to say what
// they want to see, which then trips the deterministic photo request.
const DECLINED_CAPTIONS: Record<string, string[]> = {
  en: [
    'Mmm… tell me what you want to see 😏',
    'Ask me for it properly and it\'s yours 😘',
    'What do you want to see? 😏',
  ],
  ru: [
    'Ммм… скажи, что хочешь увидеть 😏',
    'Попроси как следует — и оно твоё 😘',
    'Что хочешь увидеть? 😏',
  ],
  es: ['Mmm… dime qué quieres ver 😏', 'Pídemelo bien y es tuyo 😘', '¿Qué quieres ver? 😏'],
}

export function photoDeclinedCaption(locale: string, seed: number): string {
  return pickCaption(DECLINED_CAPTIONS, locale, seed)
}

function pickCaption(table: Record<string, string[]>, locale: string, seed: number): string {
  const list = table[locale] ?? table.en!
  const idx = Math.abs(Math.trunc(seed)) % list.length
  return list[idx]!
}
