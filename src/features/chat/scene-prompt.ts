// Builds the image prompt for an in-chat photo the SAME way the admin
// "Generate scenes" flow does (src/app/api/admin/characters/[id]/generate-image).
//
// Why this exists: chat photos go to the Atlas WAN 2.6 model, exactly like
// admin Generate scenes. The two were sending byte-identical Atlas requests
// EXCEPT the prompt — chat's old builder (image-prompt.ts, tuned for SDXL/FLUX)
// dumped the full weighted appearancePrompt plus the raw user message as a
// "scene hint", and Atlas/WAN would sit in `processing` forever on it. The
// admin's template (prefer the clean subjectTokens, Atlas-friendly phrasing)
// completes fast. Mirroring it here removes the prompt as a variable.

import { getSafetyAdultMarkerString, type ArtStyleHint } from '@/shared/ai/age-safety'
import type { SubjectGender } from '@/shared/ai/subject-gender'
import { classifyShot, shotFramingTokens, type ShotType } from './shot-framing'

// Apparent-age negative. Deliberately does NOT include "petite" or a bare
// "small" — those are legitimate adult body descriptors that many characters are
// built with (small breasts, petite frame), and negating them overrode the
// character's own design (a petite, small-breasted character rendered busty).
// The explicit minor tokens (child/teen/loli/underage/minor/childlike) + the
// gendered body guard below + the positive adult markers carry the age safety.
const SAFETY_NEGATIVE_BASE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

// `flat chest` is an age cue for a FEMALE subject only — a grown man has a flat
// chest, and negating it at 1.4 fought male anatomy on every male photo (the
// model either feminised the torso or covered it up). Male characters get the
// inverse guard instead: no breasts, no feminine face.
const SAFETY_NEGATIVE_FEMALE = '(flat chest:1.4)'
const SAFETY_NEGATIVE_MALE = '(breasts:1.4), (feminine face:1.3), (female body:1.3)'

function safetyNegative(gender: SubjectGender): string {
  return `${SAFETY_NEGATIVE_BASE}, ${
    gender === 'male' ? SAFETY_NEGATIVE_MALE : SAFETY_NEGATIVE_FEMALE
  }`
}

// Kept for the edit path's advisory negative, which has no gender context.
const SAFETY_NEGATIVE = SAFETY_NEGATIVE_BASE

const BASE_NEGATIVE =
  'low quality, blurry, deformed, bad anatomy, extra limbs, watermark, text, signature'

// Realistic chat scenes inherit the same acid-iris problem as the admin scene
// route: the pinned Pony/Illustrious-class model (or an Atlas edit) oversaturates
// eye color into a neon glow. Steer realistic photos back to a natural iris.
// Anime keeps vivid eyes. The positive carries on every backend; the negative is
// only honoured by SDXL (Atlas/FLUX drop negatives but keep the positive).
const NATURAL_EYES_POSITIVE = 'natural realistic eye color, detailed natural iris'
const NATURAL_EYES_NEGATIVE =
  '(glowing eyes:1.3), (neon eyes:1.3), (oversaturated iris:1.2), unnatural eye color, ' +
  'bright glowing eyes, (deformed iris:1.2), (deformed pupils:1.2)'

// Anime + explicit nudity is served by the warm Atlas WAN t2i (the true-anime
// LoRA cold-starts and times out). WAN's prior is photoreal, so without a strong
// 2D assertion an "anime" character's nude photo comes back semi-realistic. These
// tokens force the cel-shaded 2D look. The positive carries on every backend; the
// negative is only honoured by SDXL fallbacks (Atlas/FLUX drop negatives).
const ANIME_STYLE_POSITIVE =
  '2D anime illustration, japanese anime art style, cel-shaded, flat color fill, ' +
  'clean lineart, vibrant anime colors, drawn anime artwork, ' +
  'NOT photorealistic, NOT 3D render, NOT a realistic photo, NOT live action'
const ANIME_STYLE_NEGATIVE_BASE =
  '(photorealistic:1.4), (3D render:1.4), (realistic photo:1.4), (photograph:1.3), ' +
  '(live action:1.3), (CGI:1.2), (octane render:1.2), (semi-realistic:1.3), ' +
  '(volumetric:1.2), (depth of field:1.1)'

function animeStyleNegative(gender: SubjectGender): string {
  return `${ANIME_STYLE_NEGATIVE_BASE}, ${
    gender === 'male' ? '2boys, multiple boys' : '2girls, multiple girls'
  }`
}

// Pony/Illustrious SDXL checkpoints (the warm hard-NSFW path on fal — and the
// Novita fallback) are score-tag trained: without the score_* prefix and
// source/rating tags they render washed-out and nudity is unreliable.
// `rating_explicit` unlocks uncensored output; `source_anime` is added only for
// anime checkpoints (it would push a realistic Pony toward 2D). The negative
// drops the low-score buckets.
const PONY_PREFIX_ANIME =
  'score_9, score_8_up, score_7_up, score_6_up, source_anime, rating_explicit'
const PONY_PREFIX_REALISTIC =
  'score_9, score_8_up, score_7_up, score_6_up, rating_explicit, realistic, photorealistic'
const PONY_NEGATIVE =
  'score_6, score_5, score_4, source_furry, source_cartoon, (worst quality:1.2), (low quality:1.2)'

// Anti-duplicate-limb negative. SD1.5 photoreal models especially duplicate
// anatomy (extra arms/legs) on full-body shots; harmless on SDXL. Applied to
// every scene's negative.
const ANATOMY_NEGATIVE =
  '(extra arms:1.4), (extra legs:1.4), (extra hands:1.4), (extra limbs:1.4), ' +
  '(missing limbs:1.3), (fused limbs:1.3), (mutated hands:1.3), (malformed limbs:1.3), ' +
  '(too many fingers:1.3), (duplicate:1.3), (conjoined:1.3)'

// Anime hentai checkpoints render featureless / censored ("doll-like") genitals
// unless explicitly told to render them uncensored + detailed. Applied to
// explicit anime scenes only. Anatomy word follows the subject's gender — asking
// a male render for "detailed pussy" either feminises it or confuses the
// checkpoint into covering the crotch.
function animeUncensoredPositive(gender: SubjectGender): string {
  return gender === 'male'
    ? 'uncensored, detailed penis, male genitalia visible, anatomically correct'
    : 'uncensored, detailed pussy, anatomically correct'
}
const ANIME_UNCENSORED_NEGATIVE =
  '(censored:1.4), (mosaic censoring:1.4), (bar censor:1.4), (doll:1.3), (featureless crotch:1.3)'

// Realistic explicit scenes needed the same treatment: with only the nudity
// tokens in the scene text, photoreal checkpoints hedge — underwear stays on,
// the crotch is turned away or smoothed over. This is the "men never come back
// fully naked" report; the male half is worse because the male-nude prior is
// thinner in these checkpoints, so it needs naming outright.
function explicitBodyPositive(gender: SubjectGender): string {
  return gender === 'male'
    ? 'full frontal nudity, nude male body, bare chest, visible penis, uncensored, ' +
        'anatomically correct'
    : 'full frontal nudity, nude female body, bare breasts, uncensored, anatomically correct'
}
// Anti-censor half — safe on every explicit scene, including partial nudity.
const EXPLICIT_CENSOR_NEGATIVE =
  '(censored:1.4), (mosaic censoring:1.4), (bar censor:1.4), ' +
  '(featureless crotch:1.3), (blurred crotch:1.3)'
// Anti-garment half — only for a strip-it-all request. A partial request keeps
// clothes on purpose ("in black stockings, topless"), and negating garments
// there would undo exactly what was asked for.
const EXPLICIT_UNDRESS_NEGATIVE =
  '(underwear:1.4), (panties:1.4), (bra:1.4), (boxers:1.4), (briefs:1.4), ' +
  '(swimsuit:1.3), (clothed:1.3)'

// The scene text at this point already carries the resolved nudity tokens from
// explicitNudityTokens, so "completely nude" is a reliable full-nudity marker.
const FULL_NUDITY_SCENE = /completely nude|fully naked|no clothing/i

// Stored appearance prompts bake in the framing they were generated at — most
// notably "portrait of <subject>" (see appearance-prompt.ts) plus head-and-
// shoulders / close-up / looking-at-camera tokens. In a chat photo we want the
// REQUESTED shot ("full body, lying on the bed") to win, but the baked "portrait"
// sits at the front of the appearance text and SDXL/Atlas weight it heavily — so
// a full-body request still came back as a face/headshot. Strip those composition
// words from the appearance text so the chat's framing token is the only
// composition directive. Subject/identity tokens (hair, eyes, body) are kept.
const BAKED_FRAMING_RE =
  /\b(?:portrait of|portrait|head[\s-]and[\s-]shoulders|head ?shot|close[\s-]?up|looking at (?:the )?camera|upper body|waist[\s-]?up|bust shot|selfie)\b/gi

function stripBakedFraming(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(BAKED_FRAMING_RE, '')
    .replace(/\s*,(?:\s*,)+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}

// ── Negative-prompt composition ──────────────────────────────────────────
//
// Novita caps BOTH prompt and negative_prompt at 1024 chars, and capPrompt
// silently drops the tail at a comma boundary. Measured on a real built
// appearance, the explicit negative ran 1333 chars (realistic) / 1483 (anime),
// so 315-460 chars were cut from EVERY NSFW generation — and because the
// curated guards were appended last, what got cut was exactly ANATOMY_NEGATIVE
// (extra/fused/malformed limbs, mutated hands, duplicate, conjoined), the Pony
// low-score buckets, the framing negative, and — on anime — the whole
// anti-censor block. That is the "ugly NSFW" report: on the explicit path the
// model never received the anti-deformity negatives at all. The SFW edit path
// never hit the cap (338 chars), which is why only NSFW looked wrong.
//
// The string was also ~40% duplicates: a stored character negativePrompt
// already carries "bad anatomy / extra limbs / worst quality / mutated hands",
// which our curated blocks then repeated verbatim.
//
// Fix: compose from priority-ordered groups and drop duplicate tokens. Guards
// we least want to lose lead; the redundant character negative trails.

/** Split on top-level commas only, so weighted groups stay intact. */
function splitPromptTokens(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((t) => t.trim()).filter(Boolean)
}

// `(a, b, c)` carries no explicit weight — it's a plain grouping, so flatten it
// and let its members dedupe individually. `(child:1.5)` is weighted and stays.
function flattenGroup(token: string): string[] {
  const m = /^\((.*)\)$/s.exec(token)
  if (!m) return [token]
  const inner = m[1]!
  if (/:\s*[\d.]+\s*$/.test(inner)) return [token]
  if (!inner.includes(',')) return [token]
  return splitPromptTokens(inner).flatMap(flattenGroup)
}

/** Dedup key: the bare concept, ignoring parens and any `:weight` suffix. */
function negativeKey(token: string): string {
  return token
    .replace(/^\(+/, '')
    .replace(/\)+$/, '')
    .replace(/:\s*[\d.]+\s*$/, '')
    .trim()
    .toLowerCase()
}

function hasWeight(token: string): boolean {
  return /:\s*[\d.]+\s*\)?$/.test(token)
}

/**
 * Merge negative-prompt groups in priority order, keeping each concept once.
 * When the same concept appears both bare and weighted, the weighted variant
 * wins (in the earlier slot) — an emphasis we'd otherwise lose to dedup.
 */
export function composeNegativePrompt(
  groups: Array<string | null | undefined>,
): string {
  const order: string[] = []
  const slotByKey = new Map<string, number>()

  for (const group of groups) {
    if (!group) continue
    for (const token of splitPromptTokens(group).flatMap(flattenGroup)) {
      const key = negativeKey(token)
      if (!key) continue
      const slot = slotByKey.get(key)
      if (slot === undefined) {
        slotByKey.set(key, order.length)
        order.push(token)
      } else if (hasWeight(token) && !hasWeight(order[slot]!)) {
        order[slot] = token
      }
    }
  }

  return order.join(', ')
}

export type SceneAppearance = {
  appearancePrompt?: string | null
  subjectTokens?: string | null
  negativePrompt?: string | null
  safetyAdultMarkers?: string[] | null
}

export type BuildScenePromptInput = {
  appearance?: SceneAppearance | null
  artStyle?: ArtStyleHint
  /** Free-form scene description (outfit / pose / setting). */
  scene?: string
  /** True when the target model is FLUX — needs natural-language prompts and
      ignores negative prompts. */
  isFlux?: boolean
  /** True when the target model is a Pony-family SDXL checkpoint (Novita anime
      NSFW path) — prepends the score_* / rating_explicit tags it needs. */
  isPony?: boolean
  /** True for explicit-nudity scenes — adds uncensored/detailed-anatomy tokens
      (anime) so genitals aren't rendered featureless/censored. */
  explicit?: boolean
  /** Shot framing (selfie / full body / …). Defaults to classifying the scene
      text so callers that don't compute it still get sensible framing. */
  shot?: ShotType
  /** Which body to depict. Drives the subject noun, the danbooru 1girl/1boy tag,
      the age-safety body guard and (on explicit scenes) the anatomy tokens.
      Defaults to female — what every character rendered as before. */
  gender?: SubjectGender
}

/**
 * Assemble { prompt, negativePrompt } for a character photo, mirroring the
 * admin Generate-scenes route's non-FLUX (SDXL/Atlas) branch.
 */
export function buildCharacterScenePrompt(
  input: BuildScenePromptInput,
): { prompt: string; negativePrompt: string } {
  const appearance = input.appearance ?? null
  const isAnime = input.artStyle === 'anime'
  const gender = input.gender ?? 'female'
  const isMale = gender === 'male'
  const ageMarkerPhrase = getSafetyAdultMarkerString(isAnime ? 'anime' : 'realistic', gender)
  const safetyMarkers = appearance?.safetyAdultMarkers?.join(', ') ?? ''
  const scene = (input.scene ?? '').trim()

  // Framing tokens steer how much of the body is shown so the photo matches the
  // request (a selfie stays a close-up; "lying on the bed in a dress" comes back
  // full-body, not a cropped headshot). Defaults to classifying the scene text.
  const shot = input.shot ?? classifyShot(scene)
  const framing = shotFramingTokens(shot, { isFlux: !!input.isFlux, isAnime })

  let prompt: string
  if (input.isFlux) {
    // FLUX wants natural language, not SD tokens, and ignores negative prompts.
    const subjectDesc = appearance?.subjectTokens
      ? appearance.subjectTokens.replace(/, /g, ' with ')
      : isMale
        ? 'a handsome young man'
        : 'a beautiful young woman'
    const subjectNoun = isMale ? 'man' : 'woman'
    const adultPhrase = `${isAnime ? '18+' : '21+'} adult ${subjectNoun}`
    const scenePart = scene ? `${scene}. ` : ''
    prompt = isAnime
      ? `${scenePart}${framing.positive} 2D anime illustration, japanese anime art style, cel-shaded, clean lineart, vibrant anime colors. The character is ${subjectDesc}. ${adultPhrase}.`
      : `${scenePart}${framing.positive} Photorealistic. The ${subjectNoun} is ${subjectDesc}. High quality, soft natural lighting, ${adultPhrase}.`
  } else if (isAnime) {
    // Anime SDXL models (Illustrious / Pony) want the character's anime-styled
    // appearancePrompt (or danbooru-ish subjectTokens) — never "RAW photo /
    // photorealistic", which fights the model.
    const base = stripBakedFraming(
      appearance?.appearancePrompt ||
        appearance?.subjectTokens ||
        `anime illustration, masterpiece, best quality, ${
          isMale ? 'handsome young man' : 'beautiful young woman'
        }, detailed`,
    )
    // ALWAYS assert flat 2D anime — including on Pony. Pony V6 XL's prior is
    // 2.5D / volumetric, so with only the score tags an "anime" character came
    // back semi-realistic (reported). The cel-shaded / flat-color tokens plus
    // "1girl, solo" pull it back to flat anime and prevent stray extra
    // characters. Framing + scene lead so the requested shot wins over the
    // (de-framed) subject description.
    // Explicit anime needs the uncensored/detailed-anatomy cue or the genitals
    // render featureless ("doll-like").
    const uncensored = input.explicit
      ? `${animeUncensoredPositive(gender)}, ${explicitBodyPositive(gender)}`
      : ''
    prompt = [
      isMale ? '1boy, solo' : '1girl, solo',
      uncensored,
      ANIME_STYLE_POSITIVE,
      framing.positive,
      scene,
      base,
      safetyMarkers || ageMarkerPhrase,
    ]
      .filter(Boolean)
      .join(', ')
  } else if (scene && appearance?.subjectTokens) {
    // Order: framing (composition) → identity → scene. Framing still leads so the
    // requested shot wins, but the subject tokens come BEFORE the scene so the
    // character's hair/eyes/body actually render (buried after the long scene, SD1.5
    // under-weighted them and produced a generic person). "solo" blocks duplicate
    // bodies/limbs.
    prompt = [
      'RAW photo',
      'solo',
      framing.positive,
      stripBakedFraming(appearance.subjectTokens),
      scene,
      input.explicit ? explicitBodyPositive(gender) : '',
      safetyMarkers,
      '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  } else if (appearance?.appearancePrompt) {
    // Framing → identity → scene (see above); "solo" blocks duplicate bodies.
    prompt = [
      'RAW photo',
      'solo',
      framing.positive,
      stripBakedFraming(appearance.appearancePrompt),
      scene,
      input.explicit ? explicitBodyPositive(gender) : '',
      safetyMarkers,
    ]
      .filter(Boolean)
      .join(', ')
  } else {
    prompt = [
      framing.positive,
      scene ||
        `${
          isMale ? 'a handsome young man' : 'a beautiful young woman'
        }, photorealistic, high detail, soft natural lighting`,
      input.explicit ? explicitBodyPositive(gender) : '',
      safetyMarkers || ageMarkerPhrase,
      '8k uhd, photorealistic, realistic skin texture',
    ]
      .filter(Boolean)
      .join(', ')
  }

  // Natural-iris guard for realistic scenes only (anime keeps vivid eyes).
  if (!isAnime) prompt = `${prompt}, ${NATURAL_EYES_POSITIVE}`

  // Pony/Illustrious score+rating tags lead the prompt (style-aware: source_anime
  // only for anime checkpoints). Prepended last so they sit at the very front.
  if (input.isPony) {
    prompt = `${isAnime ? PONY_PREFIX_ANIME : PONY_PREFIX_REALISTIC}, ${prompt}`
  }

  // Ordered by what we can least afford to lose if a backend truncates (Novita
  // cuts the tail at 1024 chars): age safety → anatomy → the checkpoint's own
  // quality buckets → style → framing. The character's stored negativePrompt
  // goes last: it is the most redundant of the groups, and after dedup it
  // usually contributes only a handful of genuinely extra tokens.
  const negativePrompt = composeNegativePrompt([
    safetyNegative(gender),
    // Anti-duplicate-limb on every scene; anti-clothing/anti-censor on explicit
    // (a realistic explicit render hedges with underwear just as readily as an
    // anime one censors).
    ANATOMY_NEGATIVE,
    input.explicit ? EXPLICIT_CENSOR_NEGATIVE : null,
    input.explicit && FULL_NUDITY_SCENE.test(scene) ? EXPLICIT_UNDRESS_NEGATIVE : null,
    input.isPony ? PONY_NEGATIVE : null,
    isAnime && input.explicit ? ANIME_UNCENSORED_NEGATIVE : null,
    // All anime (incl. Pony) gets the anti-3D/anti-photoreal negative so it
    // stays flat; realistic gets the natural-iris guard instead.
    isAnime ? animeStyleNegative(gender) : NATURAL_EYES_NEGATIVE,
    framing.negative || null,
    appearance?.negativePrompt || BASE_NEGATIVE,
  ])

  return { prompt, negativePrompt }
}

export type BuildEditPromptInput = {
  /** Free-form scene description (outfit / pose / setting). */
  scene?: string
  artStyle?: ArtStyleHint
  /** True when the request is explicitly for nudity. */
  explicit?: boolean
  /** Which body the reference depicts. Only consulted on explicit requests, to
      name the anatomy the edit must render rather than cover. Defaults to
      female. */
  gender?: SubjectGender
}

/**
 * Prompt for the reference-conditioned (Atlas WAN image-edit) path. The source
 * image carries the identity, so the prompt's job is the OPPOSITE of the
 * text-to-image builder: it must NOT re-describe the subject (that re-rolls a
 * new person), only instruct the model to keep the same person and restyle the
 * scene.
 *
 * Crucially it must NOT mention body markings AT ALL — not even to forbid them.
 * Diffusion models ignore negation and latch onto the noun, so both "keep their
 * tattoos" AND "do NOT add tattoos" gave tattoo-free references full sleeves.
 * The image-edit conditioning already preserves whatever is in the reference, so
 * we just say "same skin, same body" and stay silent on tattoos/scars/piercings.
 * Verified live 2026-06-08: clean references stay clean across samples while a
 * tattooed reference (Jade) keeps her sleeve. Atlas drops negative_prompt.
 */
export function buildCharacterEditPrompt(
  input: BuildEditPromptInput,
): { prompt: string; negativePrompt: string } {
  const isAnime = input.artStyle === 'anime'
  const scene = (input.scene ?? '').trim() || 'a natural selfie, looking at the camera'
  const stylePhrase = isAnime
    ? 'Keep the 2D anime art style, cel-shaded, clean lineart.'
    : 'Keep it photorealistic with realistic skin texture and natural lighting. ' +
      'Keep the natural, true-to-reference eye color — a normal realistic iris, ' +
      'not glowing, neon, or oversaturated.'
  // For an explicit request the scene already carries the nudity tokens ("…,
  // bottomless, no underwear"). A merely permissive "nudity is allowed" lets the
  // edit keep the (usually clothed) reference's outfit, so the photo comes back
  // tame and off-request. Direct the model to actively depict the described
  // nudity and not re-clothe or censor the subject.
  // For an explicit request, framing the change as "change the outfit" implies
  // an outfit is kept — WAN image-edit then preserves the clothed reference and
  // returns a dressed photo. Instead command undressing directly and do NOT call
  // the target an "outfit". Clothed/spicy edits keep the outfit-change framing.
  //
  // Naming the anatomy matters on the male side: told only to "remove all
  // clothing", WAN leaves a man in underwear or crops/obscures the crotch far
  // more often than it does a woman (its nude-male prior is thinner). Spelling
  // out the body it must render is what makes a male explicit request actually
  // come back nude.
  const bodyClause =
    input.gender === 'male'
      ? 'His whole nude male body is visible — bare chest, bare torso, bare hips and ' +
        'penis, uncensored. '
      : 'Her whole nude body is visible — bare breasts and bare hips, uncensored. '
  const changeClause = input.explicit
    ? `Undress the subject and depict the described nudity explicitly: ${scene}. ` +
      `Remove all clothing, including underwear. ${bodyClause}` +
      `The subject is fully exposed and bare-skinned as described — ` +
      `do not cover, censor, blur, crop out the body, add lingerie or underwear, or re-clothe them. ` +
      `This is allowed 18+ adult content. `
    : `Change only the outfit, pose and setting to: ${scene}. `

  const prompt =
    'Keep the exact same person and identity from the reference image — same face, ' +
    'same hair, same skin and same body. Do not change who they are. ' +
    `${changeClause}${stylePhrase} Adults only, 18+ content.`

  // Advisory only on Atlas (image-edit ignores negative_prompt), kept for any
  // future SDXL edit backend.
  const negativePrompt = `${BASE_NEGATIVE}, ${SAFETY_NEGATIVE}, (different person:1.4), (different face:1.4)`

  return { prompt, negativePrompt }
}
