// Per-turn output guard appended to the system prompt on every chat turn,
// regardless of the (frozen) character-snapshot prompt. Two observed model
// failures it fixes: replying in the wrong / a mixed language, and leaking
// out-of-character parenthetical notes into the user-visible reply.
//
// The language rule names the target language EXPLICITLY (from the user's live
// UI locale) rather than asking the model to "match the user's language" — the
// latter let DeepSeek drift into the conversation's snapshot language or the
// character description's language. A named language is followed far more
// reliably.

const REPLY_LANG_NAME: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
}

/** Human language name for a locale, defaulting to English for unknown values. */
export function replyLanguageName(locale: string | null | undefined): string {
  return REPLY_LANG_NAME[(locale ?? '').toLowerCase()] ?? 'English'
}

/**
 * The per-turn output guard. `locale` is the language the user is chatting in
 * (the request's UI locale for live chat; the conversation language for
 * regeneration).
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
