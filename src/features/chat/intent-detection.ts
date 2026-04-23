// TODO(future): replace regex with a lightweight LLM classifier once volume justifies it

export type ChatIntent = 'image_request' | 'text'

const PATTERNS: Record<'en' | 'ru' | 'es', RegExp> = {
  en: /\b(send\s+(me\s+)?a?\s*(photo|pic|picture|selfie)|show\s+(me|yourself)|i\s+want\s+to\s+see\s+you|selfie|picture\s+of\s+you|photo\s+of\s+you)\b/i,
  ru: /(отправь\s+фото|пришли\s+фото|пришли\s+селфи|хочу\s+тебя\s+увидеть|покажи\s+себя|покажись|сделай\s+селфи|сфоткай)/i,
  es: /(m[aá]ndame\s+una\s+foto|env[ií]ame\s+una\s+foto|mu[eé]strate|quiero\s+verte|una\s+selfie|foto\s+tuya)/i,
}

export function detectImageIntent(text: string, locale: 'en' | 'ru' | 'es' | string): boolean {
  const pattern = (locale in PATTERNS ? PATTERNS[locale as 'en' | 'ru' | 'es'] : PATTERNS.en)
  return pattern.test(text)
}
