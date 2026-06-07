// Smart shot framing for in-chat photos.
//
// Problem this solves: chat photos used a single hard-coded 832×1216 portrait
// bucket and never told the model how much of the body to show. With a token
// list made of facial features (hair, eyes, …) and a tall narrow frame, SDXL's
// default prior is a head-and-shoulders close-up — so "lying on the bed in a
// dress" came back as a face selfie, body cropped out.
//
// We classify the requested scene into a shot type, then derive (a) the image
// size bucket that physically fits that framing and (b) style-aware framing
// tokens that steer the model's composition. The scene text is the same
// free-form hint the LLM emits in [SEND_PHOTO: …]; it can arrive in any
// language, so the keyword sets cover EN/RU/ES (mirroring intent-detection.ts).

import { resolveImageSize } from '@/shared/ai/image-models'

export type ShotType =
  | 'selfie' // arm's-length self-portrait: face + upper chest
  | 'closeup' // tight crop on the face
  | 'portrait' // head and shoulders (default)
  | 'half_body' // waist-up / cowboy shot — typical for seated scenes
  | 'full_body' // head-to-toe upright figure (standing, walking, outfit reveal)
  | 'full_body_wide' // reclining / horizontal full body (lying down)

// Keyword sets, checked in priority order by classifyShot. EN tokens use \b so
// short words ("sit", "stand") don't match inside larger words ("position",
// "understand"); RU/ES tokens are distinctive enough to match as substrings,
// which also sidesteps \b being ASCII-only in JS regex.
const RECLINING =
  /\b(lying|laying|lie down|reclin\w*|sprawled|sunbathing|in bed|on (?:the|a) (?:bed|couch|sofa|floor))\b|лёжа|лежа|лежу|лежишь|лежит|лежим|лежать|лежащ|приля?г|разлёгш|на кровати|на диване|на полу|загора|tumbad[ao]|acostad[ao]|recostad[ao]|echad[ao]|en la cama|en el sof|en el suelo|tomando el sol/i

const FULL_BODY =
  /\b(full[\s-]?body|full[\s-]?length|head[\s-]?to[\s-]?toe|whole body|entire body|standing|stands?|walking|dancing|twirling|posing|mirror selfie|outfit|what (?:i'?m|i am|you'?re|you are) wearing|show (?:me )?(?:your|the) (?:outfit|dress|look))\b|в полный рост|во весь рост|полный рост|стою|стоя|стоит|иду|идёт|шагаю|танцу|кружусь|наряд|во что .{0,6}одет|что на тебе надето|в зеркал|cuerpo entero|cuerpo completo|de pie|parad[ao]|caminando|bailando|selfie en el espejo|atuendo|qué llevas puesto/i

const SELFIE = /\b(selfie|self[\s-]?portrait|selca)\b|селфи|автопортрет|autofoto|autorretrato/i

const HALF_BODY =
  /\b(sitting|seated|sits|leaning|waist[\s-]?up|cowboy shot|half[\s-]?body|cafe|café|coffee shop|restaurant|at (?:a|the) (?:table|desk|bar)|by (?:a|the) window|drinking (?:coffee|tea|wine))\b|сидя|сидит|сижу|сидеть|за столом|за столиком|у окна|в кафе|по пояс|опершись|sentad[ao]|en la mesa|en el escritorio|en la ventana|en el caf|de cintura/i

const CLOSEUP =
  /\b(close[\s-]?up|your face|my face|face only|headshot|head shot)\b|крупным планом|крупный план|вблизи|\bлицо\b|primer plano|de cerca|rostro|\bcara\b/i

/**
 * Infer the shot type from a free-form scene description. Priority order
 * matters: a reclining pose ("lying on the bed") outranks the cafe/outfit
 * hints that may sit alongside it, and "mirror selfie" resolves to a full-body
 * shot before the plain "selfie" rule can claim it.
 */
export function classifyShot(scene: string | undefined | null): ShotType {
  const s = (scene ?? '').toLowerCase()
  if (!s.trim()) return 'portrait'
  if (RECLINING.test(s)) return 'full_body_wide'
  if (FULL_BODY.test(s)) return 'full_body'
  if (SELFIE.test(s)) return 'selfie'
  if (HALF_BODY.test(s)) return 'half_body'
  if (CLOSEUP.test(s)) return 'closeup'
  return 'portrait'
}

// Maps a shot type to one of the SDXL-native buckets in IMAGE_SIZE_PRESETS:
//   upright full body  → tall 9:16 (768×1344) to fit a standing figure
//   reclining/wide     → landscape 3:2 (1216×832) for a horizontal body
//   everything else    → portrait 2:3 (832×1216), the head/torso default
const SHOT_PRESET: Record<ShotType, string> = {
  selfie: 'portrait_2_3',
  closeup: 'portrait_2_3',
  portrait: 'portrait_2_3',
  half_body: 'portrait_2_3',
  full_body: 'portrait_9_16',
  full_body_wide: 'landscape_3_2',
}

/** The {width, height} bucket that physically fits the given shot's framing. */
export function shotImageSize(shot: ShotType): { width: number; height: number } {
  return resolveImageSize(SHOT_PRESET[shot])
}

export type ShotFramingTokens = {
  /** Composition tokens to weave into the positive prompt. */
  positive: string
  /** Tokens to add to the negative prompt (empty for FLUX, which ignores it). */
  negative: string
}

// SD-token framing (realistic SDXL / Atlas WAN — they read the same booru-ish
// composition tags). The negatives push back against SDXL's close-up prior on
// the full-body shots so the figure isn't cropped to a headshot.
const SD_REALISTIC: Record<ShotType, ShotFramingTokens> = {
  selfie: { positive: 'close-up selfie, upper body, face in focus', negative: '' },
  closeup: { positive: 'close-up portrait, face in focus, head and shoulders', negative: '' },
  portrait: { positive: 'portrait, head and shoulders, upper body', negative: '' },
  half_body: { positive: 'upper body, waist-up shot, cowboy shot', negative: 'full body, far away' },
  full_body: {
    positive: 'full body shot, full-length portrait, head to toe, standing, entire body visible',
    negative: 'close-up, headshot, cropped, out of frame, cropped legs',
  },
  full_body_wide: {
    positive: 'full body shot, full-length, entire body visible, wide shot',
    negative: 'close-up, headshot, cropped, out of frame',
  },
}

// Anime SDXL (Illustrious/Pony) want danbooru framing tags.
const SD_ANIME: Record<ShotType, ShotFramingTokens> = {
  selfie: { positive: 'selfie, upper body', negative: '' },
  closeup: { positive: 'close-up, face focus', negative: '' },
  portrait: { positive: 'upper body, portrait', negative: '' },
  half_body: { positive: 'cowboy shot, upper body', negative: 'full body' },
  full_body: { positive: 'full body, standing', negative: 'close-up, portrait, cropped' },
  full_body_wide: { positive: 'full body, wide shot', negative: 'close-up, portrait, cropped' },
}

// FLUX wants a natural-language sentence and ignores negative prompts.
const FLUX_SENTENCE: Record<ShotType, string> = {
  selfie: 'A close-up selfie showing her face and upper body.',
  closeup: 'A close-up shot focused on her face.',
  portrait: 'A portrait showing her head and shoulders.',
  half_body: 'A waist-up shot.',
  full_body: 'A full-body shot showing her from head to toe.',
  full_body_wide: 'A wide full-body shot showing her entire body.',
}

/**
 * Framing tokens for the target model family. FLUX gets a natural-language
 * sentence (no negative); SDXL realistic and anime get composition tags.
 */
export function shotFramingTokens(
  shot: ShotType,
  opts: { isFlux?: boolean; isAnime?: boolean },
): ShotFramingTokens {
  if (opts.isFlux) return { positive: FLUX_SENTENCE[shot], negative: '' }
  return opts.isAnime ? SD_ANIME[shot] : SD_REALISTIC[shot]
}
