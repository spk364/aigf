// Structured appearance parameters → Stable Diffusion prompt builder.
// Supports realistic (RealVisXL) and anime art styles.

export type BodyType = 'slim' | 'athletic' | 'curvy' | 'petite' | 'thick'
export type BreastSize = 'small' | 'medium' | 'large' | 'very_large'
export type ButtSize = 'small' | 'medium' | 'large' | 'very_large'
export type HairColor =
  | 'black' | 'dark_brown' | 'brown' | 'light_brown'
  | 'blonde' | 'dark_blonde' | 'red' | 'auburn'
  | 'white' | 'silver' | 'pink' | 'blue' | 'purple'
export type HairLength = 'short' | 'medium' | 'long' | 'very_long'
export type HairStyle = 'straight' | 'wavy' | 'curly' | 'ponytail' | 'twin_tails' | 'bun' | 'bob' | 'braided'
export type EyeColor = 'brown' | 'dark_brown' | 'blue' | 'light_blue' | 'green' | 'hazel' | 'grey' | 'amber' | 'violet'
export type SkinTone = 'very_fair' | 'fair' | 'light' | 'medium' | 'olive' | 'tan' | 'brown' | 'dark'
export type Ethnicity = 'caucasian' | 'asian' | 'latina' | 'middle_eastern' | 'african' | 'mixed'
export type AgeAppearance = 'young_adult' | 'mid_twenties' | 'late_twenties' | 'thirties' | 'early_forties'
export type ArtStyle = 'realistic' | 'anime' | '3d_render' | 'stylized'

export type CharacterAppearanceParams = {
  ethnicity?: Ethnicity
  ageAppearance?: AgeAppearance
  bodyType?: BodyType
  breastSize?: BreastSize
  buttSize?: ButtSize
  height?: 'petite' | 'average' | 'tall'
  hairColor?: HairColor
  hairLength?: HairLength
  hairStyle?: HairStyle
  eyeColor?: EyeColor
  skinTone?: SkinTone
  // Freeform extras appended verbatim (makeup, accessories, etc.)
  extraTokens?: string[]
}

export type BuiltAppearance = {
  params: CharacterAppearanceParams
  // Full portrait prompt (preamble + subject + quality). Use when no scene hint.
  appearancePrompt: string
  // Character descriptor tokens only — no RAW photo preamble, no quality suffix.
  // Embed into scene-driven prompts: "{scene}, {subjectTokens}, {safetyMarkers}, quality"
  subjectTokens: string
  negativePrompt: string
  safetyAdultMarkers: string[]
}

// ─── lookup tables ────────────────────────────────────────────────────────────

const ETHNICITY: Record<Ethnicity, string> = {
  caucasian: 'caucasian',
  asian: 'asian',
  latina: 'latina',
  middle_eastern: 'middle eastern',
  african: 'african',
  mixed: 'mixed race',
}

const AGE: Record<AgeAppearance, string> = {
  young_adult: '20 year old',
  mid_twenties: '25 year old',
  late_twenties: '28 year old',
  thirties: '32 year old',
  early_forties: '42 year old',
}

const BODY_TYPE: Record<BodyType, string> = {
  slim: 'slim slender body',
  athletic: 'athletic toned fit body',
  curvy: 'curvy hourglass figure, shapely body, defined waist',
  petite: 'petite small frame',
  thick: 'thick full figured body',
}

const BREAST_SIZE: Record<BreastSize, string> = {
  small: 'small breasts',
  medium: 'medium breasts',
  large: 'large breasts, big boobs',
  very_large: 'very large breasts, huge boobs, busty',
}

const BUTT_SIZE: Record<ButtSize, string> = {
  small: 'small butt',
  medium: '',
  large: 'big round butt',
  very_large: 'huge bubble butt',
}

const HAIR_COLOR: Record<HairColor, string> = {
  black: 'black',
  dark_brown: 'dark brown',
  brown: 'brown',
  light_brown: 'light brown',
  blonde: 'blonde',
  dark_blonde: 'dark blonde',
  red: 'red',
  auburn: 'auburn',
  white: 'white',
  silver: 'silver',
  pink: 'pink',
  blue: 'blue',
  purple: 'purple',
}

const HAIR_LENGTH: Record<HairLength, string> = {
  short: 'short',
  medium: 'medium length',
  long: 'long',
  very_long: 'very long',
}

const HAIR_STYLE: Record<HairStyle, string> = {
  straight: 'straight',
  wavy: 'wavy',
  curly: 'curly',
  ponytail: 'ponytail',
  twin_tails: 'twin tails',
  bun: 'bun',
  bob: 'bob cut',
  braided: 'braided',
}

const EYE_COLOR: Record<EyeColor, string> = {
  brown: 'brown',
  dark_brown: 'dark brown',
  blue: 'blue',
  light_blue: 'light blue',
  green: 'green',
  hazel: 'hazel',
  grey: 'grey',
  amber: 'amber',
  violet: 'violet',
}

const SKIN_TONE: Record<SkinTone, string> = {
  very_fair: 'very fair porcelain skin',
  fair: 'fair pale skin',
  light: 'light skin',
  medium: 'medium skin',
  olive: 'olive skin',
  tan: 'tanned skin',
  brown: 'brown skin',
  dark: 'dark skin',
}

// ─── negative prompts ─────────────────────────────────────────────────────────

const REALISTIC_NEGATIVE =
  '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime), ' +
  'text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, ' +
  'mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, ' +
  'blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, ' +
  'gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, ' +
  'fused fingers, too many fingers, long neck, watermark, signature'

const ANIME_NEGATIVE =
  'worst quality, low quality, normal quality, lowres, low details, oversaturated, undersaturated, ' +
  'overexposed, underexposed, grayscale, bw, bad photo, bad photography, bad art, watermark, signature, ' +
  'username, blurry, ugly, deformed, disfigured, bad proportions, extra limbs, extra fingers, ' +
  'mutated hands, bad anatomy, floating limbs, disconnected limbs, malformed hands'

// Adult age markers — always injected into every prompt to assert the character
// is a fully developed adult (spec §3.10 Layer 6).
const SAFETY_ADULT_MARKERS = [
  'adult woman',
  '(18+ years old:1.3)',
  'fully developed adult body',
  'mature woman',
]

const REALISTIC_QUALITY =
  '8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3, photorealistic, realistic skin texture'

const ANIME_QUALITY = 'detailed face, sharp focus, vibrant colors'

// ─── subject-token builders (no preamble, no quality) ─────────────────────────

function buildRealisticSubjectTokens(p: CharacterAppearanceParams): string {
  const parts: string[] = []

  const ethnicity = p.ethnicity ? ETHNICITY[p.ethnicity] : 'beautiful'
  const age = p.ageAppearance ? AGE[p.ageAppearance] : '25 year old'
  parts.push(`${ethnicity} ${age} woman`)

  if (p.bodyType) parts.push(BODY_TYPE[p.bodyType])
  if (p.skinTone) parts.push(SKIN_TONE[p.skinTone])

  if (p.hairColor || p.hairLength || p.hairStyle) {
    const color = p.hairColor ? HAIR_COLOR[p.hairColor] : ''
    const length = p.hairLength ? HAIR_LENGTH[p.hairLength] : ''
    const style = p.hairStyle ? HAIR_STYLE[p.hairStyle] : ''
    const hairDesc = [color, length, style].filter(Boolean).join(' ')
    if (hairDesc) parts.push(`${hairDesc} hair`)
  }

  if (p.eyeColor) parts.push(`${EYE_COLOR[p.eyeColor]} eyes`)
  if (p.breastSize) parts.push(BREAST_SIZE[p.breastSize])

  const butt = p.buttSize ? BUTT_SIZE[p.buttSize] : ''
  if (butt) parts.push(butt)

  if (p.extraTokens?.length) parts.push(...p.extraTokens)

  return parts.filter(Boolean).join(', ')
}

function buildAnimeSubjectTokens(p: CharacterAppearanceParams): string {
  const parts: string[] = []

  const ethnicity = p.ethnicity === 'asian' ? 'japanese' : (p.ethnicity ? ETHNICITY[p.ethnicity] : 'beautiful')
  parts.push(`${ethnicity} anime girl`)

  if (p.bodyType) {
    const animeBody = p.bodyType === 'curvy' ? 'curvy figure' : p.bodyType === 'slim' ? 'slender figure' : BODY_TYPE[p.bodyType]
    parts.push(animeBody)
  }

  if (p.hairColor || p.hairLength || p.hairStyle) {
    const color = p.hairColor ? HAIR_COLOR[p.hairColor] : ''
    const length = p.hairLength ? HAIR_LENGTH[p.hairLength] : ''
    const style = p.hairStyle ? HAIR_STYLE[p.hairStyle] : ''
    const hairDesc = [color, length, style].filter(Boolean).join(' ')
    if (hairDesc) parts.push(`${hairDesc} hair`)
  }

  if (p.eyeColor) parts.push(`${EYE_COLOR[p.eyeColor]} eyes, beautiful detailed eyes`)
  if (p.skinTone && ['very_fair', 'fair', 'light'].includes(p.skinTone)) parts.push('fair skin')
  if (p.breastSize && p.breastSize !== 'small') parts.push(BREAST_SIZE[p.breastSize])

  if (p.extraTokens?.length) parts.push(...p.extraTokens)

  return parts.filter(Boolean).join(', ')
}

// ─── full prompt builders (preamble + subject + quality) ──────────────────────

function buildRealisticPrompt(p: CharacterAppearanceParams): string {
  const subject = buildRealisticSubjectTokens(p)
  return ['RAW photo', `portrait of ${subject}`, REALISTIC_QUALITY].join(', ')
}

function buildAnimePrompt(p: CharacterAppearanceParams): string {
  const subject = buildAnimeSubjectTokens(p)
  return ['anime style, masterpiece, best quality, ultra-detailed', `portrait of ${subject}`, ANIME_QUALITY].join(', ')
}

export function buildAppearanceFromParams(
  params: CharacterAppearanceParams,
  artStyle: ArtStyle = 'realistic',
): BuiltAppearance {
  const isAnime = artStyle === 'anime'
  const appearancePrompt = isAnime ? buildAnimePrompt(params) : buildRealisticPrompt(params)
  const subjectTokens = isAnime ? buildAnimeSubjectTokens(params) : buildRealisticSubjectTokens(params)
  const negativePrompt = isAnime ? ANIME_NEGATIVE : REALISTIC_NEGATIVE

  return {
    params,
    appearancePrompt,
    subjectTokens,
    negativePrompt,
    safetyAdultMarkers: SAFETY_ADULT_MARKERS,
  }
}
