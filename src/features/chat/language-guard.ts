// Per-turn output guard appended to the system prompt on every chat turn,
// regardless of the (frozen) character-snapshot prompt. Two observed model
// failures it fixes: replying in the wrong / a mixed language, and leaking
// out-of-character parenthetical notes into the user-visible reply.
//
// The language rule names the target language EXPLICITLY rather than asking the
// model to "match the user's language" — the latter let DeepSeek drift into the
// conversation's snapshot language or the character description's language. A
// named language is followed far more reliably.
//
// The target language is taken from the language the user is ACTUALLY TYPING
// (detected per-message), NOT the UI locale. Users frequently have the UI in one
// language while chatting in another; keying the guard off the UI locale made the
// character reply in the UI language instead of the language the user wrote in.
// Detection falls back to the UI locale only when the message is too short /
// ambiguous to detect (e.g. "ok", an emoji), so there is no regression there.

const REPLY_LANG_NAME: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
}

/** Human language name for a locale, defaulting to English for unknown values. */
export function replyLanguageName(locale: string | null | undefined): string {
  return REPLY_LANG_NAME[(locale ?? '').toLowerCase()] ?? 'English'
}

// Common Spanish function/affection words that rarely appear in English, used to
// disambiguate Spanish from English when neither diacritics nor a non-Latin
// script is present. Kept small and high-precision; ambiguous messages fall back
// to the UI locale rather than guessing.
const ES_WORDS = new Set([
  'que', 'qué', 'de', 'la', 'el', 'los', 'las', 'una', 'un', 'es', 'está',
  'estás', 'con', 'para', 'por', 'pero', 'como', 'cómo', 'más', 'muy', 'tú',
  'te', 'quiero', 'eres', 'hola', 'sí', 'dónde', 'porque', 'cuando', 'tengo',
  'tienes', 'soy', 'gracias', 'amor', 'cariño', 'guapo', 'guapa', 'nena',
])
const EN_WORDS = new Set([
  'the', 'and', 'you', 'are', 'is', 'to', 'of', 'what', 'how', 'where',
  'because', 'when', 'have', 'do', 'does', 'your', 'this', 'that', 'with',
  'for', 'but', 'like', 'want', 'love', 'hello', 'yeah', 'baby', 'please',
])

/**
 * Best-effort detection of the language a chat message is written in. Returns a
 * supported locale ('en' | 'ru' | 'es') when confident, or null when the text is
 * too short / ambiguous (so the caller can fall back to the UI locale).
 *
 * - Cyrillic script → Russian (fully reliable; this is the dominant failure case).
 * - Spanish-only characters (ñ, ¿, ¡, accented vowels) → Spanish.
 * - Otherwise a small high-precision stopword count distinguishes es vs en, and
 *   returns null when neither clearly wins.
 */
export function detectMessageLanguage(
  text: string | null | undefined,
): 'en' | 'ru' | 'es' | null {
  if (!text) return null
  // Cyrillic anywhere → the user is writing Russian.
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'
  // Spanish-specific orthography.
  if (/[ñ¿¡áéíóúü]/i.test(text)) return 'es'

  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let es = 0
  let en = 0
  for (const w of words) {
    if (ES_WORDS.has(w)) es++
    if (EN_WORDS.has(w)) en++
  }
  if (es >= 2 && es > en) return 'es'
  if (en >= 2 && en > es) return 'en'
  return null
}

/**
 * Resolve the locale the reply should be written in: the language detected from
 * the user's message, falling back to the UI/conversation locale when the
 * message is too ambiguous to detect.
 */
export function resolveReplyLocale(
  text: string | null | undefined,
  fallbackLocale: string | null | undefined,
): string | null | undefined {
  return detectMessageLanguage(text) ?? fallbackLocale
}

/**
 * The per-turn output guard. `locale` is the language the reply must be written
 * in — resolve it with {@link resolveReplyLocale} from the user's message so it
 * tracks what the user is actually typing, not just the UI locale.
 */
export function buildOutputGuard(locale: string | null | undefined): string {
  const lang = replyLanguageName(locale)
  return (
    'Output rules for your reply:\n' +
    `- Write your ENTIRE reply in ${lang}. ${lang} is the user's language — always reply in ` +
    `${lang}, never in another language and never mixing languages, no matter what language earlier ` +
    'messages or your character description are written in.\n' +
    '- Stay fully in character. The user must see ONLY the character speaking — never add ' +
    'out-of-character notes, meta-commentary, disclaimers, or parentheses about consent, age, or being an AI.'
  )
}
