// Preset options for the in-chat photo composer (T1-3). Each option carries a
// localized `labelKey` (shown on the chip) and an English `prompt` fragment that
// is spliced into the photo-request message. We send English scene tokens
// regardless of UI language because the SD models the image pipeline uses
// resolve English prompts far better — the chip label the user sees is still
// translated. Mirrors the existing hardcoded "Send me a selfie" being English.
//
// Options are deliberately tasteful/SFW-leaning. The input safety scorer still
// runs on the assembled message, so nothing here can bypass the filters.

export type PhotoOption = {
  key: string
  // i18n key under chat.photoComposer.<group>.<key>
  labelKey: string
  // English scene fragment used to build the request message.
  prompt: string
}

export type PhotoOptionGroup = {
  // i18n key under chat.photoComposer.groups
  group: 'outfit' | 'pose' | 'setting'
  options: PhotoOption[]
}

export const PHOTO_OPTION_GROUPS: PhotoOptionGroup[] = [
  {
    group: 'outfit',
    options: [
      { key: 'casual', labelKey: 'outfit.casual', prompt: 'in casual clothes' },
      { key: 'dress', labelKey: 'outfit.dress', prompt: 'wearing an elegant dress' },
      { key: 'cozy', labelKey: 'outfit.cozy', prompt: 'in a cozy oversized sweater' },
      { key: 'swimwear', labelKey: 'outfit.swimwear', prompt: 'in swimwear' },
      { key: 'lingerie', labelKey: 'outfit.lingerie', prompt: 'in lingerie' },
      { key: 'workout', labelKey: 'outfit.workout', prompt: 'in workout clothes' },
    ],
  },
  {
    group: 'pose',
    options: [
      { key: 'selfie', labelKey: 'pose.selfie', prompt: 'taking a selfie, smiling' },
      { key: 'lying', labelKey: 'pose.lying', prompt: 'lying on the bed, relaxed' },
      { key: 'sitting', labelKey: 'pose.sitting', prompt: 'sitting by the window' },
      { key: 'mirror', labelKey: 'pose.mirror', prompt: 'a mirror selfie' },
      { key: 'looking_back', labelKey: 'pose.lookingBack', prompt: 'looking over her shoulder' },
    ],
  },
  {
    group: 'setting',
    options: [
      { key: 'bedroom', labelKey: 'setting.bedroom', prompt: 'in the bedroom' },
      { key: 'beach', labelKey: 'setting.beach', prompt: 'on the beach at sunset' },
      { key: 'cafe', labelKey: 'setting.cafe', prompt: 'in a cozy cafe' },
      { key: 'home', labelKey: 'setting.home', prompt: 'at home' },
      { key: 'city', labelKey: 'setting.city', prompt: 'in the city at night' },
    ],
  },
]

// Assembles the photo-request message from the selected fragments. Falls back to
// a plain selfie when nothing is picked, matching the previous one-tap behavior.
export function buildPhotoRequest(selected: {
  outfit?: string
  pose?: string
  setting?: string
  extra?: string
}): string {
  const fragments = [selected.pose, selected.outfit, selected.setting]
    .filter((f): f is string => !!f && f.length > 0)

  let base = 'Send me a photo of you'
  if (fragments.length > 0) {
    base += ' ' + fragments.join(', ')
  } else {
    base = 'Send me a selfie'
  }
  const extra = selected.extra?.trim()
  if (extra) base += `, ${extra}`
  return base
}

// Resolves a fragment's English prompt by group+key. Used by the composer to map
// the user's chip selection back to the prompt fragment.
export function fragmentFor(group: string, key: string): string | undefined {
  const g = PHOTO_OPTION_GROUPS.find((x) => x.group === group)
  return g?.options.find((o) => o.key === key)?.prompt
}

// Counterpart to buildPhotoRequest: recover the scene description from a user's
// photo request. The chat route normally takes the scene from the model's
// [SEND_PHOTO: …] hint, but the model frequently emits a bare [SEND_PHOTO] even
// when the user gave a detailed request — and then the whole request ("…lying on
// the bed, in swimwear, on the beach at sunset") is dropped and the photo
// defaults to a portrait. This strips the leading request clause and returns the
// descriptive remainder so the framing survives. Only called for explicit photo
// requests, so the input is known to be about a photo.

// Cut everything up to and including the subject ("…of you", "…de ti").
const REQUEST_SUBJECT_CUT = /^.*?\b(?:of\s+your?self|of\s+you|yourself|de\s+ti(?:\s+mism[ao])?)\b[\s,:.-]*/i

// Otherwise strip a leading send/show verb + optional "me", article and photo
// noun: "Send me a photo", "Отправь мне фото", "Mándame una foto".
const REQUEST_VERB_LEAD =
  /^\s*(?:please\s+|por\s+favor[,\s]+|пожалуйста[,\s]+)?(?:(?:can|could|would|will)\s+you\s+)?(?:send|show|share|take|snap|gimme|give\s+me|m[aá]nda(?:me)?|env[ií]ame|mu[eé]stra(?:me|te)|manda|env[ií]a|отправь?|пришли(?:те)?|скинь?|кинь?|шли|покажи(?:сь)?|сделай|сфоткай(?:ся)?)\s+(?:me\s+|мне\s+)?(?:a\s+|an\s+|una\s+|un\s+)?(?:photos?|pictures?|pics?|images?|selfies?|fotos?|fotito|im[aá]gen|сним[оккаи]+|фотк[ауи]|фото|селфи|картинк[ау])?\s*/i

// A leftover bare subject word after the cuts above ("you", "себя"). Uses a
// unicode letter lookahead instead of \b — JS \b is ASCII-only and never fires
// after a Cyrillic letter.
const DANGLING_SUBJECT = /^(?:you|yourself|тебя|себя|ti)(?![\p{L}])[\s,:.-]*/iu

// Nothing descriptive remains — a plain "send me a selfie".
const GENERIC_PHOTO_NOUN =
  /^(?:a\s+)?(?:photos?|pictures?|pics?|images?|selfies?|fotos?|im[aá]gen|сним[оккаи]+|фото|селфи|фотк[ауи])$/i

export function sceneFromPhotoRequest(message: string): string {
  let s = message.trim()
  const subjectCut = s.match(REQUEST_SUBJECT_CUT)
  if (subjectCut) {
    s = s.slice(subjectCut[0].length)
  } else {
    s = s.replace(REQUEST_VERB_LEAD, '')
  }
  s = s.replace(DANGLING_SUBJECT, '')
  s = s.replace(/^[\s,.!?:;-]+/u, '').replace(/[\s,.!?:;-]+$/u, '').trim()
  if (!s || GENERIC_PHOTO_NOUN.test(s)) return ''
  return s
}
