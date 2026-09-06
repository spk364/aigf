// Photo-intent detection, two tiers:
//
//  - detectImageIntent (HARD tier): unmistakable photo requests only. A match
//    FORCES a photo this turn — and charges the user IMAGE_TOKEN_COST — so the
//    patterns must never fire on casual conversation. Bare "покажи"/"show me"
//    and appearance questions ("what do you look like", "как ты выглядишь")
//    used to live here and force-charged users for photos they never asked
//    for; they now belong to the soft tier below.
//
//  - mentionsPhotoKeyword (SOFT tier): the user's message plausibly references
//    a photo or asks about the character's looks. Used as the user-side
//    confirmation for a model-emitted [SEND_PHOTO] directive: the LLM decides
//    the intent, but a photo (and the charge) only goes out when the user's own
//    message gives photo-ish signal. This keeps regex-missed phrasings working
//    without letting the model spontaneously charge for photos on a plain "hi".

import { isExplicitPhotoScene } from './photo-consistency'

export type ChatIntent = 'image_request' | 'text'

const HARD_PATTERNS: Record<'en' | 'ru' | 'es', RegExp> = {
  en: /\b((send|show|share|take|snap|gimme|give\s+me)\s+(me\s+)?(a\s+|another\s+|your\s+)?(photo|pic|picture|selfie|image|nude|shot)|(can|could|may|let)\s+(i|me)\s+see\s+(you|a\s+(photo|pic))|i\s+(want|wanna|need|would\s+like)\s+to\s+see\s+you|wanna\s+see\s+you|show\s+yourself|(a\s+)?selfie\s*(please|pls)?$|(photo|pic|picture|image)\s+of\s+you)\b/i,
  ru: /(отправь?|пришли?|скинь?|кинь?|шли)\s*(мне\s+)?(ещё\s+|еще\s+)?(сво[юё]\s+|одну\s+)?(фото|фотк[ауи]|селфи|снимок|пик|картинк[ау])|(хочу|можно|давай|хотел[аи]?\s+бы)\s+(тебя\s+)?(увидеть|фото|фотк[ау]|селфи)|покажи(сь|\s+себя|\s+фото|\s+фотк[ау]|\s+селфи)|сфоткай(ся)?|сделай\s+селфи/i,
  es: /(m[aá]ndame|env[ií]ame|ens[eé][ñn]ame|manda|env[ií]a)\s+(una\s+|otra\s+|tu\s+)?(foto|selfie|imagen|fotito)|(quiero|puedo|me\s+gustar[ií]a|d[eé]jame)\s+verte|mu[eé]strate|una\s+selfie|foto\s+tuya/i,
}

export function detectImageIntent(text: string, _locale?: 'en' | 'ru' | 'es' | string): boolean {
  // A photo request is a photo request regardless of the conversation's
  // language: users frequently type the request in a different language (most
  // often English) than the thread's locale. Testing every pattern keeps the
  // deterministic booster firing for those cross-language requests — without it
  // an English "send me a photo" in a Russian thread is missed, the photo is
  // never forced, and the model is free to decline. The patterns are
  // word-specific enough that one language's request won't match another's.
  return Object.values(HARD_PATTERNS).some((re) => re.test(text))
}

// Photo-ish nouns in any supported language, plus appearance questions that a
// model-emitted directive is allowed to interpret as a photo request.
const SOFT_PATTERN =
  /\b(photo|photos|pic|pics|picture|pictures|selfie|selfies|image|nude|nudes|foto|fotos|fotito|selfi)\b|фото|фотк|фотограф|селфи|снимок|картинк|покажи|show\s+(me|yourself|you)|what\s+(do|are)\s+you\s+(look|wearing)|how\s+do\s+you\s+look|как\s+ты\s+выглядишь|во\s+что\s+ты\s+одета|c[oó]mo\s+(eres|te\s+ves)|qu[eé]\s+llevas\s+puesto|mu[eé]stra(te|me)|ens[eé][ñn]ame/i

/**
 * True when the user's message plausibly references a photo / the character's
 * looks. Looser than {@link detectImageIntent} — used only to confirm a
 * model-emitted [SEND_PHOTO] directive, never to force a photo by itself.
 *
 * Nudity/undress phrasing counts too. The most common way users refine a photo
 * they just received is a bare follow-up — "fully naked", "без белья", "take it
 * off" — which names no photo noun at all. The soft gate rejected those, so the
 * model's [SEND_PHOTO] was dropped and the turn produced neither a photo nor
 * (when the model replied with the directive alone) any text. Reusing the
 * explicit-scene markers keeps the gate honest: it still takes the model
 * deciding a photo fits before one is generated and charged.
 */
export function mentionsPhotoKeyword(text: string): boolean {
  return SOFT_PATTERN.test(text) || isExplicitPhotoScene(text)
}
