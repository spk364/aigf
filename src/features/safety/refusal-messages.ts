// Localized refusal text shown to the user when Layer 3 (input filter) blocks
// a turn. Hard blocks are firm and warn about repeated attempts; soft blocks
// invite the user to clarify (their wording was ambiguous, not malicious).
//
// These are deliberately short — the chat surface streams them as a single
// SSE delta and they replace the would-be assistant reply.

type Locale = 'en' | 'ru' | 'es' | string
type Severity = 'soft_block' | 'hard_block'

const HARD_BLOCK_MESSAGES: Record<'en' | 'ru' | 'es', string> = {
  en: "I can't engage with that request. This was logged; repeated attempts may suspend your account.",
  ru: 'Я не могу участвовать в таком разговоре. Запрос зарегистрирован — повторные попытки приведут к блокировке аккаунта.',
  es: 'No puedo participar en esa solicitud. Quedó registrada; repetir el intento puede suspender tu cuenta.',
}

const SOFT_BLOCK_MESSAGES: Record<'en' | 'ru' | 'es', string> = {
  en: 'Your message has ambiguous wording. Try rephrasing — make it explicit that anyone described is an adult.',
  ru: 'Твоё сообщение звучит неоднозначно. Переформулируй и уточни, что все участники — взрослые.',
  es: 'Tu mensaje es ambiguo. Intenta reformularlo y aclara que todas las personas descritas son adultas.',
}

function pickLocale(locale: Locale): 'en' | 'ru' | 'es' {
  if (locale === 'ru' || locale === 'es' || locale === 'en') return locale
  return 'en'
}

export function getInputRefusalMessage(locale: Locale, severity: Severity): string {
  const key = pickLocale(locale)
  return severity === 'hard_block' ? HARD_BLOCK_MESSAGES[key] : SOFT_BLOCK_MESSAGES[key]
}
