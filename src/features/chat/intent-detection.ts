// Intent detection is no longer the *only* gate for sending a photo — the
// character's reply decides via the [SEND_PHOTO] directive (see
// photo-directive.ts), which the LLM applies to far more phrasings than a regex
// can. This detector is now a reliability booster: when it matches, the chat
// route forces the directive for the turn so an unmistakable request is never
// missed. Hence the patterns err toward broad coverage of common phrasings.

export type ChatIntent = 'image_request' | 'text'

const PATTERNS: Record<'en' | 'ru' | 'es', RegExp> = {
  en: /\b((send|show|share|take|snap|gimme|give\s+me)\s+(me\s+)?(a\s+)?(photo|pic|picture|selfie|image|nude|shot)|(can|could|may|let)\s+(i|me)\s+see\s+(you|that|a\s+(photo|pic))|i\s+(want|wanna|need|would\s+like)\s+to\s+see\s+you|wanna\s+see\s+you|show\s+(me|yourself)|selfie|(photo|pic|picture|image)\s+of\s+you|what\s+(do|are)\s+you\s+(look|wearing))\b/i,
  ru: /(отправь?|пришли?|скинь?|кинь?|шли)\s*(мне\s+)?(фото|фотк[ауи]|селфи|снимок|пик|картинк[ау])|(хочу|можно|давай|хотел[аи]?\s+бы)\s+(тебя\s+)?(увидеть|фото|фотк[ау]|селфи|посмотреть)|покажи(сь|\s+себя|\s+фото|\s+фотк[ау])?|сфоткай(ся)?|сделай\s+селфи|как\s+ты\s+выглядишь/i,
  es: /(m[aá]ndame|env[ií]ame|ens[eé][ñn]ame|manda|env[ií]a)\s+(una\s+)?(foto|selfie|imagen|fotito)|(quiero|puedo|me\s+gustar[ií]a|d[eé]jame)\s+verte|mu[eé]stra(te|me)|una\s+selfie|foto\s+tuya|c[oó]mo\s+(eres|te\s+ves)/i,
}

export function detectImageIntent(text: string, _locale?: 'en' | 'ru' | 'es' | string): boolean {
  // A photo request is a photo request regardless of the conversation's
  // language: users frequently type the request in a different language (most
  // often English) than the thread's locale. Testing every pattern keeps the
  // deterministic booster firing for those cross-language requests — without it
  // an English "send me a photo" in a Russian thread is missed, the photo is
  // never forced, and the model is free to decline. The patterns are
  // word-specific enough that one language's request won't match another's.
  return Object.values(PATTERNS).some((re) => re.test(text))
}
