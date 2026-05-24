// User-facing refusal copy for the safety pipeline, in the three product
// locales. Deliberately vague on hard blocks (don't coach evasion) and
// actionable on soft blocks (the user likely phrased something ambiguously).

type Locale = 'en' | 'ru' | 'es'

function pick(locale: string | undefined, m: Record<Locale, string>): string {
  const l = (locale === 'ru' || locale === 'es' ? locale : 'en') as Locale
  return m[l]
}

export function softBlockMessage(locale?: string): string {
  return pick(locale, {
    en: 'Your request contains ambiguous language. Please clarify the age or description — everyone here is a consenting adult (21+).',
    ru: 'В вашем запросе есть неоднозначные формулировки. Уточните возраст или описание — здесь все совершеннолетние (21+).',
    es: 'Tu solicitud contiene lenguaje ambiguo. Aclara la edad o la descripción — aquí todos son adultos que consienten (21+).',
  })
}

export function hardBlockMessage(locale?: string): string {
  return pick(locale, {
    en: "I can't help with that. This request violates our content policy and was blocked.",
    ru: 'Я не могу с этим помочь. Этот запрос нарушает нашу политику и был заблокирован.',
    es: 'No puedo ayudar con eso. Esta solicitud viola nuestra política de contenido y fue bloqueada.',
  })
}

// In-character refusal substituted when the model's OWN output trips the
// output filter. Stays in the companion's voice rather than breaking the fourth
// wall, so a rare false positive doesn't feel like a system error.
export function outputRefusalMessage(locale?: string): string {
  return pick(locale, {
    en: "Mmm, let's not go there — that's a hard limit for me. Tell me something else you're into? 💕",
    ru: 'Ммм, давай не будем об этом — для меня это запретная тема. Расскажи лучше, что тебе ещё нравится? 💕',
    es: 'Mmm, mejor no vayamos por ahí — eso es un límite para mí. ¿Cuéntame otra cosa que te guste? 💕',
  })
}
