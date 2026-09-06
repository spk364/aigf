// Preset options for the in-chat photo composer (T1-3). Each option carries a
// localized `labelKey` (shown on the chip) and an English `prompt` fragment that
// is spliced into the photo-request message. We send English scene tokens
// regardless of UI language because the SD models the image pipeline uses
// resolve English prompts far better — the chip label the user sees is still
// translated. Mirrors the existing hardcoded "Send me a selfie" being English.
//
// Each group runs tasteful → spicy in display order, so the everyday picks sit
// where the thumb lands and the explicit ones are a deliberate reach. The input
// safety scorer still runs on the assembled message, so nothing here can bypass
// the filters.
//
// Fragments are written WITHOUT gendered pronouns ("looking back over the
// shoulder", not "over her shoulder"): most chips are shared, and a female
// pronoun in the scene fights a male character's own appearance tokens
// downstream.
//
// The chips that CAN'T be shared are marked. Offering "Elegant dress" and
// "Lingerie" on an AI-boyfriend thread was the reported problem — the sheet
// was built for the girls catalogue and never adapted. `gender` hides a chip
// from the other side and `malePrompt` retunes a shared chip whose neutral
// wording still reads female to the image model ("in swimwear" → a bikini).

import type { SubjectGender } from '@/shared/ai/subject-gender'

export type PhotoOption = {
  key: string
  // i18n key under chat.photoComposer.<group>.<key>
  labelKey: string
  // English scene fragment used to build the request message.
  prompt: string
  /** Show this chip only for the given subject gender. Omitted = both. */
  gender?: SubjectGender
  /** Scene fragment to use instead of `prompt` when the subject is male. */
  malePrompt?: string
  /** Label to use instead of `labelKey` when the subject is male. Needed where
      the noun itself is gendered — RU "Купальник" vs "Плавки". */
  maleLabelKey?: string
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
      {
        key: 'dress',
        labelKey: 'outfit.dress',
        prompt: 'wearing an elegant dress',
        gender: 'female',
      },
      { key: 'suit', labelKey: 'outfit.suit', prompt: 'in a sharp tailored suit' },
      { key: 'cozy', labelKey: 'outfit.cozy', prompt: 'in a cozy oversized sweater' },
      { key: 'shirt', labelKey: 'outfit.shirt', prompt: 'in an oversized white shirt' },
      {
        key: 'open_shirt',
        labelKey: 'outfit.openShirt',
        prompt: 'in an unbuttoned shirt, bare chest showing',
        gender: 'male',
      },
      { key: 'leather', labelKey: 'outfit.leather', prompt: 'in a leather jacket' },
      { key: 'workout', labelKey: 'outfit.workout', prompt: 'in workout clothes' },
      { key: 'pajamas', labelKey: 'outfit.pajamas', prompt: 'in pajamas' },
      {
        key: 'swimwear',
        labelKey: 'outfit.swimwear',
        prompt: 'in swimwear',
        // Bare "swimwear" resolves to a bikini on every checkpoint we dispatch to.
        malePrompt: 'in swim shorts, bare chest',
        maleLabelKey: 'outfit.swimwearMale',
      },
      { key: 'robe', labelKey: 'outfit.robe', prompt: 'in a silk robe, loosely tied' },
      { key: 'towel', labelKey: 'outfit.towel', prompt: 'wrapped in a towel, fresh out of the shower' },
      {
        key: 'shirtless',
        labelKey: 'outfit.shirtless',
        prompt: 'shirtless, bare chest, bare torso',
        gender: 'male',
      },
      { key: 'lingerie', labelKey: 'outfit.lingerie', prompt: 'in lingerie', gender: 'female' },
      {
        key: 'boxers',
        labelKey: 'outfit.boxers',
        prompt: 'in tight boxer briefs, shirtless',
        gender: 'male',
      },
      { key: 'nude', labelKey: 'outfit.nude', prompt: 'wearing nothing at all, completely nude' },
    ],
  },
  {
    group: 'pose',
    options: [
      { key: 'selfie', labelKey: 'pose.selfie', prompt: 'taking a selfie, smiling' },
      { key: 'mirror', labelKey: 'pose.mirror', prompt: 'a mirror selfie' },
      { key: 'closeup', labelKey: 'pose.closeup', prompt: 'a close-up of the face, looking at the camera' },
      { key: 'standing', labelKey: 'pose.standing', prompt: 'standing, full body, head to toe' },
      { key: 'sitting', labelKey: 'pose.sitting', prompt: 'sitting by the window' },
      { key: 'lying', labelKey: 'pose.lying', prompt: 'lying on the bed, relaxed' },
      { key: 'looking_back', labelKey: 'pose.lookingBack', prompt: 'looking back over the shoulder' },
      {
        key: 'stretching',
        labelKey: 'pose.stretching',
        prompt: 'stretching, just woke up',
        // RU/ES render this as a past participle, which carries grammatical
        // gender ("Только проснулась" / "Только проснулся").
        maleLabelKey: 'pose.stretchingMale',
      },
      {
        key: 'flexing',
        labelKey: 'pose.flexing',
        prompt: 'flexing, showing off the arms and chest',
        gender: 'male',
      },
      { key: 'kiss', labelKey: 'pose.kiss', prompt: 'blowing a kiss to the camera' },
      { key: 'undressing', labelKey: 'pose.undressing', prompt: 'undressing, slowly taking clothes off' },
    ],
  },
  {
    group: 'setting',
    options: [
      { key: 'home', labelKey: 'setting.home', prompt: 'at home' },
      { key: 'bedroom', labelKey: 'setting.bedroom', prompt: 'in the bedroom' },
      { key: 'kitchen', labelKey: 'setting.kitchen', prompt: 'in the kitchen' },
      { key: 'balcony', labelKey: 'setting.balcony', prompt: 'on the balcony at golden hour' },
      { key: 'cafe', labelKey: 'setting.cafe', prompt: 'in a cozy cafe' },
      { key: 'gym', labelKey: 'setting.gym', prompt: 'at the gym' },
      { key: 'car', labelKey: 'setting.car', prompt: 'in the car' },
      { key: 'city', labelKey: 'setting.city', prompt: 'in the city at night' },
      { key: 'beach', labelKey: 'setting.beach', prompt: 'on the beach at sunset' },
      { key: 'pool', labelKey: 'setting.pool', prompt: 'by the pool' },
      { key: 'bathroom', labelKey: 'setting.bathroom', prompt: 'in the bathroom' },
      { key: 'shower', labelKey: 'setting.shower', prompt: 'in the shower, wet skin' },
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

/** The fragment this option contributes for the given subject. */
export function optionPrompt(option: PhotoOption, gender: SubjectGender = 'female'): string {
  return gender === 'male' && option.malePrompt ? option.malePrompt : option.prompt
}

/**
 * The chips to show for a character, with each option's prompt already resolved
 * for that subject — so the composer can stay gender-agnostic and just read
 * `option.prompt`.
 */
export function photoOptionGroupsFor(gender: SubjectGender = 'female'): PhotoOptionGroup[] {
  return PHOTO_OPTION_GROUPS.map((g) => ({
    ...g,
    options: g.options
      .filter((o) => !o.gender || o.gender === gender)
      .map((o) => ({
        ...o,
        prompt: optionPrompt(o, gender),
        labelKey: gender === 'male' && o.maleLabelKey ? o.maleLabelKey : o.labelKey,
      })),
  }))
}

/** Every i18n key the composer can ask for, both gender variants included. */
export function allPhotoOptionLabelKeys(): string[] {
  return PHOTO_OPTION_GROUPS.flatMap((g) =>
    g.options.flatMap((o) => (o.maleLabelKey ? [o.labelKey, o.maleLabelKey] : [o.labelKey])),
  )
}

// Resolves a fragment's English prompt by group+key. Used by the composer to map
// the user's chip selection back to the prompt fragment.
export function fragmentFor(
  group: string,
  key: string,
  gender: SubjectGender = 'female',
): string | undefined {
  const g = PHOTO_OPTION_GROUPS.find((x) => x.group === group)
  const option = g?.options.find((o) => o.key === key)
  return option ? optionPrompt(option, gender) : undefined
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
