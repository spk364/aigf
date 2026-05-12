// Options catalog for the character builder. Each option carries a stable
// `value` (the only thing persisted in the draft / character JSON), an i18n
// `labelKey`, an optional `promptFragment` injected into Stable Diffusion
// prompts, and visual metadata used by the image-card UI:
//   - imagePath: relative URL to a static reference image at `/public/builder/{cat}/{val}.jpg`.
//     The card falls back to a styled gradient + emoji when the file is missing,
//     so the builder always renders even before assets are dropped in.
//   - emoji + gradient: fallback skin for the option card.

export type BuilderOption = {
  value: string
  labelKey: string
  promptFragment?: string
  imagePath?: string
  emoji?: string
  gradient?: [string, string]
}

// Five-axis personality model aligned with joi.com's slider set. Each value
// is 1..10 where 1 = left label, 10 = right label.
export type PersonalityTraits = {
  dominant: number    // 1 = submissive, 10 = dominant
  confident: number   // 1 = insecure, 10 = confident
  passionate: number  // 1 = cold, 10 = passionate
  outgoing: number    // 1 = reserved, 10 = outgoing
  playful: number     // 1 = serious, 10 = playful
}

export type ArchetypeOption = BuilderOption & {
  defaultTraits: PersonalityTraits
  systemPromptFragment: string
}

// ── Gender ────────────────────────────────────────────────────────────────

export const GENDERS: BuilderOption[] = [
  {
    value: 'female',
    labelKey: 'builder.options.gender.female',
    imagePath: '/builder/gender/female.jpg',
    emoji: '♀',
    gradient: ['#ff7fae', '#330e1f'],
  },
  {
    value: 'male',
    labelKey: 'builder.options.gender.male',
    imagePath: '/builder/gender/male.jpg',
    emoji: '♂',
    gradient: ['#7a8bff', '#11173b'],
  },
]

// ── Art style ────────────────────────────────────────────────────────────

export const ART_STYLES: BuilderOption[] = [
  {
    value: 'realistic',
    labelKey: 'builder.options.artStyle.realistic',
    promptFragment: 'photorealistic, high detail, soft lighting',
    imagePath: '/builder/art-style/realistic.jpg',
    emoji: '📷',
    gradient: ['#7a4f33', '#1f110a'],
  },
  {
    value: 'anime',
    labelKey: 'builder.options.artStyle.anime',
    promptFragment: 'anime style, detailed illustration',
    imagePath: '/builder/art-style/anime.jpg',
    emoji: '🌸',
    gradient: ['#ff7ab8', '#3b1130'],
  },
]

// ── Image model (only shown when artStyle === 'realistic') ───────────────
// Curated set of fal.ai endpoints that work well for photorealistic
// portraits. Values match `id` in src/shared/ai/image-models.ts so the
// admin generate-image route and the chat-time generation pipeline both
// accept the saved value verbatim. Default is RealVisXL — fashion-clean
// photorealism that builds the cleanest first impression. The two Pony
// options below trade some studio polish for NSFW-strong rendering.
export const REALISTIC_MODELS: BuilderOption[] = [
  {
    value: 'fal-ai/realistic-vision',
    labelKey: 'builder.options.realisticModel.realvis',
    emoji: '✨',
    gradient: ['#7a6a4f', '#1f1810'],
  },
  {
    value: 'John6666/pony-realism-v22-main-sdxl',
    labelKey: 'builder.options.realisticModel.ponyRealism',
    emoji: '🎬',
    gradient: ['#a25a5a', '#2a1010'],
  },
  {
    value: 'John6666/cyberrealistic-pony-v110-sdxl',
    labelKey: 'builder.options.realisticModel.cyberRealistic',
    emoji: '🌃',
    gradient: ['#6a5a8a', '#1a0e2e'],
  },
]

export const DEFAULT_REALISTIC_MODEL = REALISTIC_MODELS[0]!.value

// ── Path choice (presets vs unique description) ──────────────────────────

export const DESIGN_APPROACHES: BuilderOption[] = [
  {
    value: 'presets',
    labelKey: 'builder.options.approach.presets',
    emoji: '🎯',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'unique',
    labelKey: 'builder.options.approach.unique',
    emoji: '✏️',
    gradient: ['#b07aff', '#1f1138'],
  },
]

// ── Ethnicity (single select, joi-style) ─────────────────────────────────

export const ETHNICITIES: BuilderOption[] = [
  {
    value: 'european',
    labelKey: 'builder.options.ethnicity.european',
    promptFragment: 'European features, fair skin',
    imagePath: '/builder/ethnicity/european.jpg',
    emoji: '🇪🇺',
    gradient: ['#d6b89a', '#3a2a1a'],
  },
  {
    value: 'asian',
    labelKey: 'builder.options.ethnicity.asian',
    promptFragment: 'East Asian features, fair skin',
    imagePath: '/builder/ethnicity/asian.jpg',
    emoji: '🏮',
    gradient: ['#e8b58a', '#3a1f1a'],
  },
  {
    value: 'latina',
    labelKey: 'builder.options.ethnicity.latina',
    promptFragment: 'Latina features, olive skin',
    imagePath: '/builder/ethnicity/latina.jpg',
    emoji: '💃',
    gradient: ['#c9805d', '#2b1612'],
  },
  {
    value: 'african',
    labelKey: 'builder.options.ethnicity.african',
    promptFragment: 'African features, brown skin',
    imagePath: '/builder/ethnicity/african.jpg',
    emoji: '🌍',
    gradient: ['#8a533a', '#1a0c08'],
  },
  {
    value: 'south_asian',
    labelKey: 'builder.options.ethnicity.south_asian',
    promptFragment: 'South Asian features, tan skin',
    imagePath: '/builder/ethnicity/south_asian.jpg',
    emoji: '🪔',
    gradient: ['#caa078', '#2c1d12'],
  },
  {
    value: 'middle_eastern',
    labelKey: 'builder.options.ethnicity.middle_eastern',
    promptFragment: 'Middle Eastern features, olive skin',
    imagePath: '/builder/ethnicity/middle_eastern.jpg',
    emoji: '🕌',
    gradient: ['#b88860', '#241710'],
  },
]

// ── Age ──────────────────────────────────────────────────────────────────

export type AgeRangeOption = BuilderOption & {
  minAge: 21
  rangeLabel: string
  defaultAge: number
}

// Joi groups ages as 18+ / 20s / 30s / 40s / 50s. We default each bucket
// toward the young end of its decade so the AI persona reads as
// young-adult unless the user explicitly nudges higher.
export const AGE_RANGES: AgeRangeOption[] = [
  {
    value: 'twenties',
    labelKey: 'builder.options.ageRange.twenties',
    minAge: 21,
    rangeLabel: '20s',
    defaultAge: 22,
    imagePath: '/builder/age/twenties.jpg',
    emoji: '🌹',
    gradient: ['#ff7da3', '#3a1421'],
  },
  {
    value: 'thirties',
    labelKey: 'builder.options.ageRange.thirties',
    minAge: 21,
    rangeLabel: '30s',
    defaultAge: 31,
    imagePath: '/builder/age/thirties.jpg',
    emoji: '🍷',
    gradient: ['#b85c75', '#2c0e1a'],
  },
  {
    value: 'forties',
    labelKey: 'builder.options.ageRange.forties',
    minAge: 21,
    rangeLabel: '40s',
    defaultAge: 42,
    imagePath: '/builder/age/forties.jpg',
    emoji: '🥂',
    gradient: ['#8e5a78', '#1f0f1a'],
  },
  {
    value: 'fifties',
    labelKey: 'builder.options.ageRange.fifties',
    minAge: 21,
    rangeLabel: '50s',
    defaultAge: 52,
    imagePath: '/builder/age/fifties.jpg',
    emoji: '🍸',
    gradient: ['#7a4f6c', '#180a14'],
  },
]

// ── Body shape ───────────────────────────────────────────────────────────

export const BODY_TYPES: BuilderOption[] = [
  {
    value: 'slim',
    labelKey: 'builder.options.bodyType.slim',
    promptFragment: 'slim slender build',
    imagePath: '/builder/body-type/slim.jpg',
    emoji: '🌿',
    gradient: ['#a8c2e0', '#0f1d2e'],
  },
  {
    value: 'athletic',
    labelKey: 'builder.options.bodyType.athletic',
    promptFragment: 'athletic toned fit body',
    imagePath: '/builder/body-type/athletic.jpg',
    emoji: '💪',
    gradient: ['#9bd0a8', '#0e2418'],
  },
  {
    value: 'average',
    labelKey: 'builder.options.bodyType.average',
    promptFragment: 'average build',
    imagePath: '/builder/body-type/average.jpg',
    emoji: '🧍‍♀️',
    gradient: ['#cfb89a', '#2c2218'],
  },
  {
    value: 'curvy',
    labelKey: 'builder.options.bodyType.curvy',
    promptFragment: '(extreme hourglass figure:1.4), (very curvy body:1.3), (wide hips and full bust:1.3), defined narrow waist',
    imagePath: '/builder/body-type/curvy.jpg',
    emoji: '⏳',
    gradient: ['#ff8aa6', '#3a1421'],
  },
  {
    value: 'bbw',
    labelKey: 'builder.options.bodyType.bbw',
    promptFragment: 'voluptuous full-figured body, thick',
    imagePath: '/builder/body-type/bbw.jpg',
    emoji: '🍑',
    gradient: ['#ff6b8e', '#330b18'],
  },
]

export const BREAST_SIZES: BuilderOption[] = [
  {
    value: 'flat',
    labelKey: 'builder.options.breastSize.flat',
    promptFragment: 'flat chest, very small bust',
    imagePath: '/builder/breast-size/flat.jpg',
    emoji: '🤍',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'small',
    labelKey: 'builder.options.breastSize.small',
    promptFragment: 'small bust, modest chest',
    imagePath: '/builder/breast-size/small.jpg',
    emoji: '💗',
    gradient: ['#cfb89a', '#2c2218'],
  },
  {
    value: 'average',
    labelKey: 'builder.options.breastSize.average',
    promptFragment: 'medium bust, balanced chest',
    imagePath: '/builder/breast-size/average.jpg',
    emoji: '💞',
    gradient: ['#e8a0bc', '#2a1220'],
  },
  {
    value: 'big',
    labelKey: 'builder.options.breastSize.big',
    promptFragment: 'large bust, full chest, busty',
    imagePath: '/builder/breast-size/big.jpg',
    emoji: '🔥',
    gradient: ['#ff7fae', '#330e1f'],
  },
  {
    value: 'huge',
    labelKey: 'builder.options.breastSize.huge',
    promptFragment: 'very large bust, busty figure',
    imagePath: '/builder/breast-size/huge.jpg',
    emoji: '💥',
    gradient: ['#ff5a8a', '#2a0712'],
  },
]

export const BUTT_SIZES: BuilderOption[] = [
  {
    value: 'slim',
    labelKey: 'builder.options.buttSize.slim',
    promptFragment: 'slim narrow hips, slim rear',
    imagePath: '/builder/butt-size/slim.jpg',
    emoji: '🤍',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'small',
    labelKey: 'builder.options.buttSize.small',
    promptFragment: 'small narrow hips',
    imagePath: '/builder/butt-size/small.jpg',
    emoji: '💗',
    gradient: ['#cfb89a', '#2c2218'],
  },
  {
    value: 'athletic',
    labelKey: 'builder.options.buttSize.athletic',
    promptFragment: 'athletic firm rear, toned glutes',
    imagePath: '/builder/butt-size/athletic.jpg',
    emoji: '💪',
    gradient: ['#9bd0a8', '#0e2418'],
  },
  {
    value: 'big',
    labelKey: 'builder.options.buttSize.big',
    promptFragment: 'large round hips, full rear',
    imagePath: '/builder/butt-size/big.jpg',
    emoji: '🍑',
    gradient: ['#ff7fae', '#330e1f'],
  },
  {
    value: 'huge',
    labelKey: 'builder.options.buttSize.huge',
    promptFragment: 'very large round hips, big bubble butt',
    imagePath: '/builder/butt-size/huge.jpg',
    emoji: '🔥',
    gradient: ['#ff5a8a', '#2a0712'],
  },
]

// ── Hair ─────────────────────────────────────────────────────────────────

export const HAIR_COLORS: BuilderOption[] = [
  { value: 'blonde', labelKey: 'builder.options.hairColor.blonde', promptFragment: 'blonde hair', emoji: '👱‍♀️', gradient: ['#f0d28a', '#3a2f10'] },
  { value: 'black', labelKey: 'builder.options.hairColor.black', promptFragment: 'jet black hair', emoji: '🖤', gradient: ['#3a3038', '#0a070a'] },
  { value: 'brown', labelKey: 'builder.options.hairColor.brown', promptFragment: 'brown hair', emoji: '🪵', gradient: ['#8a5a3a', '#1f1108'] },
  { value: 'red', labelKey: 'builder.options.hairColor.red', promptFragment: 'red hair, vivid ginger', emoji: '🦊', gradient: ['#d04a20', '#290804'] },
  { value: 'gray', labelKey: 'builder.options.hairColor.gray', promptFragment: 'silver gray hair', emoji: '🩶', gradient: ['#a3b0bc', '#0f1418'] },
  { value: 'white', labelKey: 'builder.options.hairColor.white', promptFragment: 'platinum white hair', emoji: '✨', gradient: ['#f5e8d0', '#2c2418'] },
  { value: 'auburn', labelKey: 'builder.options.hairColor.auburn', promptFragment: 'auburn hair, reddish brown', emoji: '🍁', gradient: ['#a04a30', '#220906'] },
  { value: 'pink', labelKey: 'builder.options.hairColor.pink', promptFragment: 'pink hair', emoji: '🌸', gradient: ['#ff90c4', '#33102a'] },
  { value: 'blue', labelKey: 'builder.options.hairColor.blue', promptFragment: 'blue hair', emoji: '💙', gradient: ['#5aa8ff', '#091a3a'] },
  { value: 'purple', labelKey: 'builder.options.hairColor.purple', promptFragment: 'purple hair', emoji: '💜', gradient: ['#b07aff', '#1f1138'] },
]

export const HAIR_LENGTHS: BuilderOption[] = [
  { value: 'short', labelKey: 'builder.options.hairLength.short', promptFragment: 'short', imagePath: '/builder/hair-length/short.jpg', emoji: '💇‍♀️', gradient: ['#b89aff', '#1c1140'] },
  { value: 'medium', labelKey: 'builder.options.hairLength.medium', promptFragment: 'medium length', imagePath: '/builder/hair-length/medium.jpg', emoji: '👩', gradient: ['#9aa5ff', '#101140'] },
  { value: 'long', labelKey: 'builder.options.hairLength.long', promptFragment: 'long flowing', imagePath: '/builder/hair-length/long.jpg', emoji: '💁‍♀️', gradient: ['#7a82ff', '#0e0e3a'] },
]

// Hair styles aligned with joi (Straight / Bangs / Braids / Curly / Bun /
// Ponytail / Bob), with two extras kept for variety.
export const HAIR_STYLES: BuilderOption[] = [
  { value: 'straight', labelKey: 'builder.options.hairStyle.straight', promptFragment: 'straight hair', imagePath: '/builder/hair-style/straight.jpg', emoji: '➖', gradient: ['#a3b6cc', '#0f1a26'] },
  { value: 'wavy', labelKey: 'builder.options.hairStyle.wavy', promptFragment: 'wavy hair, soft waves', imagePath: '/builder/hair-style/wavy.jpg', emoji: '🌊', gradient: ['#85c0e0', '#091924'] },
  { value: 'curly', labelKey: 'builder.options.hairStyle.curly', promptFragment: 'curly hair, voluminous curls', imagePath: '/builder/hair-style/curly.jpg', emoji: '🌀', gradient: ['#b07aff', '#1f1138'] },
  { value: 'bangs', labelKey: 'builder.options.hairStyle.bangs', promptFragment: 'hair with bangs', imagePath: '/builder/hair-style/bangs.jpg', emoji: '✂️', gradient: ['#cfb89a', '#2c2218'] },
  { value: 'braids', labelKey: 'builder.options.hairStyle.braids', promptFragment: 'braided hair', imagePath: '/builder/hair-style/braids.jpg', emoji: '🪢', gradient: ['#a86f4a', '#22120a'] },
  { value: 'ponytail', labelKey: 'builder.options.hairStyle.ponytail', promptFragment: 'hair in a ponytail', imagePath: '/builder/hair-style/ponytail.jpg', emoji: '🎀', gradient: ['#ff90b8', '#330d22'] },
  { value: 'bun', labelKey: 'builder.options.hairStyle.bun', promptFragment: 'hair in a bun, hair tied up', imagePath: '/builder/hair-style/bun.jpg', emoji: '🍡', gradient: ['#d6a48e', '#2a1810'] },
  { value: 'bob', labelKey: 'builder.options.hairStyle.bob', promptFragment: 'bob cut, chin-length hair', imagePath: '/builder/hair-style/bob.jpg', emoji: '💁', gradient: ['#cfb89a', '#2c2218'] },
]

export const EYE_COLORS: BuilderOption[] = [
  { value: 'brown', labelKey: 'builder.options.eyeColor.brown', promptFragment: 'brown eyes', imagePath: '/builder/eye-color/brown.jpg', emoji: '🤎', gradient: ['#8a5a3a', '#1f1108'] },
  { value: 'blue', labelKey: 'builder.options.eyeColor.blue', promptFragment: 'blue eyes', imagePath: '/builder/eye-color/blue.jpg', emoji: '💙', gradient: ['#5aa8ff', '#091a3a'] },
  { value: 'green', labelKey: 'builder.options.eyeColor.green', promptFragment: 'green eyes', imagePath: '/builder/eye-color/green.jpg', emoji: '💚', gradient: ['#5ac98a', '#0a2418'] },
  { value: 'gray', labelKey: 'builder.options.eyeColor.gray', promptFragment: 'gray eyes', imagePath: '/builder/eye-color/gray.jpg', emoji: '🩶', gradient: ['#a3b0bc', '#0f1418'] },
]

// ── Sexual orientation (joi parity) ──────────────────────────────────────

export const SEXUAL_ORIENTATIONS: BuilderOption[] = [
  { value: 'straight', labelKey: 'builder.options.orientation.straight', emoji: '🤍', gradient: ['#000000', '#888888'] },
  { value: 'bisexual', labelKey: 'builder.options.orientation.bisexual', emoji: '💖', gradient: ['#d40080', '#0033aa'] },
  { value: 'queer', labelKey: 'builder.options.orientation.queer', emoji: '🌈', gradient: ['#b07aff', '#0e7a2f'] },
  { value: 'lesbian', labelKey: 'builder.options.orientation.lesbian', emoji: '🧡', gradient: ['#d52d00', '#a30262'] },
]

// ── Chat style (controls system-prompt template) ─────────────────────────

export type ChatStyleOption = BuilderOption & {
  systemPromptDirective: string
}

export const CHAT_STYLES: ChatStyleOption[] = [
  {
    value: 'default',
    labelKey: 'builder.options.chatStyle.default',
    imagePath: '/builder/chat-style/default.jpg',
    emoji: '💬',
    gradient: ['#cfb89a', '#2c2218'],
    systemPromptDirective:
      'Tone: warm, casual, conversational. Reply length: 2–4 sentences. Match the user\'s energy.',
  },
  {
    value: 'deep_roleplay',
    labelKey: 'builder.options.chatStyle.deepRoleplay',
    imagePath: '/builder/chat-style/deep_roleplay.jpg',
    emoji: '🎭',
    gradient: ['#7a4f9c', '#160a26'],
    systemPromptDirective:
      'Tone: immersive roleplay. Use *italics* for actions and gestures. Stay deeply in character. Reply length: 3–6 sentences with vivid sensory detail.',
  },
  {
    value: 'creative',
    labelKey: 'builder.options.chatStyle.creative',
    imagePath: '/builder/chat-style/creative.jpg',
    emoji: '🎨',
    gradient: ['#b07aff', '#1f1138'],
    systemPromptDirective:
      'Tone: imaginative, descriptive, playful with language. Use rich metaphor and unexpected comparisons. Reply length: 3–5 sentences.',
  },
  {
    value: 'realistic',
    labelKey: 'builder.options.chatStyle.realistic',
    imagePath: '/builder/chat-style/realistic.jpg',
    emoji: '📱',
    gradient: ['#a3b6cc', '#0f1a26'],
    systemPromptDirective:
      'Tone: like real-life texting. Short messages (1–2 sentences). Casual punctuation, occasional typos, modern slang. Sometimes one-word replies.',
  },
]

// ── Occupation (joi-parity preset list + custom) ─────────────────────────

export const OCCUPATIONS: BuilderOption[] = [
  { value: 'massage_therapist', labelKey: 'builder.options.occupation.massage_therapist', emoji: '💆‍♀️', gradient: ['#ffb0c4', '#330d22'], imagePath: '/builder/occupation/massage_therapist.jpg' },
  { value: 'fitness_coach', labelKey: 'builder.options.occupation.fitness_coach', emoji: '🏋️‍♀️', gradient: ['#9bd0a8', '#0e2418'], imagePath: '/builder/occupation/fitness_coach.jpg' },
  { value: 'secretary', labelKey: 'builder.options.occupation.secretary', emoji: '💼', gradient: ['#7a85b0', '#0e1224'], imagePath: '/builder/occupation/secretary.jpg' },
  { value: 'flight_attendant', labelKey: 'builder.options.occupation.flight_attendant', emoji: '✈️', gradient: ['#5aa8ff', '#091a3a'], imagePath: '/builder/occupation/flight_attendant.jpg' },
  { value: 'librarian', labelKey: 'builder.options.occupation.librarian', emoji: '📚', gradient: ['#a86f4a', '#22120a'], imagePath: '/builder/occupation/librarian.jpg' },
  { value: 'doctor', labelKey: 'builder.options.occupation.doctor', emoji: '🩺', gradient: ['#a3b6cc', '#0f1a26'], imagePath: '/builder/occupation/doctor.jpg' },
  { value: 'nurse', labelKey: 'builder.options.occupation.nurse', emoji: '👩‍⚕️', gradient: ['#ffb0c4', '#330d22'], imagePath: '/builder/occupation/nurse.jpg' },
  { value: 'police_officer', labelKey: 'builder.options.occupation.police_officer', emoji: '👮‍♀️', gradient: ['#7a82ff', '#0e0e3a'], imagePath: '/builder/occupation/police_officer.jpg' },
  { value: 'teacher', labelKey: 'builder.options.occupation.teacher', emoji: '👩‍🏫', gradient: ['#cfb89a', '#2c2218'], imagePath: '/builder/occupation/teacher.jpg' },
  { value: 'student', labelKey: 'builder.options.occupation.student', emoji: '🎓', gradient: ['#b07aff', '#1f1138'], imagePath: '/builder/occupation/student.jpg' },
  { value: 'artist', labelKey: 'builder.options.occupation.artist', emoji: '🎨', gradient: ['#ff7ab8', '#3b1130'], imagePath: '/builder/occupation/artist.jpg' },
  { value: 'lawyer', labelKey: 'builder.options.occupation.lawyer', emoji: '⚖️', gradient: ['#7a85b0', '#0e1224'], imagePath: '/builder/occupation/lawyer.jpg' },
  { value: 'streamer', labelKey: 'builder.options.occupation.streamer', emoji: '🎮', gradient: ['#ff90c4', '#33102a'], imagePath: '/builder/occupation/streamer.jpg' },
  { value: 'actress', labelKey: 'builder.options.occupation.actress', emoji: '🎬', gradient: ['#c2902a', '#291a04'], imagePath: '/builder/occupation/actress.jpg' },
  { value: 'model', labelKey: 'builder.options.occupation.model', emoji: '📸', gradient: ['#ffb0c4', '#330d22'], imagePath: '/builder/occupation/model.jpg' },
  { value: 'custom', labelKey: 'builder.options.occupation.custom', emoji: '✏️', gradient: ['#a3b6cc', '#0f1a26'] },
]

// ── Starting relationship (replaces meet-scenarios + relationship-stage) ─

// Note: family-themed entries from joi (step-sister, step-mom, brother's
// wife) are intentionally excluded for compliance — see spec §3.10.
export const STARTING_RELATIONSHIPS: BuilderOption[] = [
  { value: 'stranger', labelKey: 'builder.options.startingRelationship.stranger', emoji: '👋', gradient: ['#a3b6cc', '#0f1a26'] },
  { value: 'colleague', labelKey: 'builder.options.startingRelationship.colleague', emoji: '💼', gradient: ['#7a85b0', '#0e1224'] },
  { value: 'girlfriend', labelKey: 'builder.options.startingRelationship.girlfriend', emoji: '💕', gradient: ['#ffb0c4', '#330d22'] },
  { value: 'wife', labelKey: 'builder.options.startingRelationship.wife', emoji: '💍', gradient: ['#c2902a', '#291a04'] },
  { value: 'girl_next_door', labelKey: 'builder.options.startingRelationship.girl_next_door', emoji: '🏠', gradient: ['#cfb89a', '#2c2218'] },
  { value: 'boss', labelKey: 'builder.options.startingRelationship.boss', emoji: '👔', gradient: ['#7a85b0', '#0e1224'] },
  { value: 'friend', labelKey: 'builder.options.startingRelationship.friend', emoji: '🤝', gradient: ['#9bd0a8', '#0e2418'] },
  { value: 'ex', labelKey: 'builder.options.startingRelationship.ex', emoji: '💔', gradient: ['#ff5a8a', '#2a0712'] },
  { value: 'fwb', labelKey: 'builder.options.startingRelationship.fwb', emoji: '🔥', gradient: ['#ff7fae', '#330e1f'] },
  { value: 'classmate', labelKey: 'builder.options.startingRelationship.classmate', emoji: '🎓', gradient: ['#b07aff', '#1f1138'] },
  { value: 'gym_buddy', labelKey: 'builder.options.startingRelationship.gym_buddy', emoji: '🏋️‍♀️', gradient: ['#9bd0a8', '#0e2418'] },
  { value: 'roommate', labelKey: 'builder.options.startingRelationship.roommate', emoji: '🛋️', gradient: ['#a3b6cc', '#0f1a26'] },
  { value: 'custom', labelKey: 'builder.options.startingRelationship.custom', emoji: '✏️', gradient: ['#a3b6cc', '#0f1a26'] },
]

// ── Kinks (curated subset, multi-select) ─────────────────────────────────
//
// We trim joi's ~98 list to ~36 entries that are shippable without raising
// CCBill / payment-processor flags. Hard-line categories (anything coercive,
// anything family-themed) are excluded; safety scorer filters at chat time
// regardless.
export const KINKS: BuilderOption[] = [
  { value: 'romantic', labelKey: 'builder.options.kink.romantic', emoji: '💞' },
  { value: 'flirty', labelKey: 'builder.options.kink.flirty', emoji: '😘' },
  { value: 'teasing', labelKey: 'builder.options.kink.teasing', emoji: '😈' },
  { value: 'dirty_talk', labelKey: 'builder.options.kink.dirty_talk', emoji: '🔥' },
  { value: 'sexting', labelKey: 'builder.options.kink.sexting', emoji: '📱' },
  { value: 'roleplay', labelKey: 'builder.options.kink.roleplay', emoji: '🎭' },
  { value: 'voyeurism', labelKey: 'builder.options.kink.voyeurism', emoji: '👀' },
  { value: 'exhibitionism', labelKey: 'builder.options.kink.exhibitionism', emoji: '🪞' },
  { value: 'bdsm_light', labelKey: 'builder.options.kink.bdsm_light', emoji: '⛓️' },
  { value: 'bondage', labelKey: 'builder.options.kink.bondage', emoji: '🪢' },
  { value: 'dom', labelKey: 'builder.options.kink.dom', emoji: '👑' },
  { value: 'sub', labelKey: 'builder.options.kink.sub', emoji: '🎀' },
  { value: 'switch', labelKey: 'builder.options.kink.switch', emoji: '🔄' },
  { value: 'brat', labelKey: 'builder.options.kink.brat', emoji: '😜' },
  { value: 'praise', labelKey: 'builder.options.kink.praise', emoji: '🌟' },
  { value: 'degradation', labelKey: 'builder.options.kink.degradation', emoji: '🖤' },
  { value: 'edging', labelKey: 'builder.options.kink.edging', emoji: '⏳' },
  { value: 'orgasm_control', labelKey: 'builder.options.kink.orgasm_control', emoji: '🎚️' },
  { value: 'anticipation', labelKey: 'builder.options.kink.anticipation', emoji: '⏰' },
  { value: 'biting', labelKey: 'builder.options.kink.biting', emoji: '🦷' },
  { value: 'spanking', labelKey: 'builder.options.kink.spanking', emoji: '✋' },
  { value: 'rough', labelKey: 'builder.options.kink.rough', emoji: '💪' },
  { value: 'gentle', labelKey: 'builder.options.kink.gentle', emoji: '🌷' },
  { value: 'sensual_massage', labelKey: 'builder.options.kink.sensual_massage', emoji: '💆‍♀️' },
  { value: 'lingerie', labelKey: 'builder.options.kink.lingerie', emoji: '👙' },
  { value: 'feet', labelKey: 'builder.options.kink.feet', emoji: '🦶' },
  { value: 'public', labelKey: 'builder.options.kink.public', emoji: '🌆' },
  { value: 'shower', labelKey: 'builder.options.kink.shower', emoji: '🚿' },
  { value: 'morning', labelKey: 'builder.options.kink.morning', emoji: '🌅' },
  { value: 'late_night', labelKey: 'builder.options.kink.late_night', emoji: '🌙' },
  { value: 'oral', labelKey: 'builder.options.kink.oral', emoji: '👄' },
  { value: 'anal', labelKey: 'builder.options.kink.anal', emoji: '🍑' },
  { value: 'breasts', labelKey: 'builder.options.kink.breasts', emoji: '💗' },
  { value: 'mutual', labelKey: 'builder.options.kink.mutual', emoji: '🤝' },
  { value: 'first_time', labelKey: 'builder.options.kink.first_time', emoji: '🌹' },
  { value: 'long_distance', labelKey: 'builder.options.kink.long_distance', emoji: '📞' },
]

// ── Personality archetypes ────────────────────────────────────────────────
//
// Defaults are now expressed as the joi-parity 5-axis model:
//   dominant, confident, passionate, outgoing, playful
// where 1 = left label, 10 = right label.

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: 'sweet_girlfriend',
    labelKey: 'builder.options.archetype.sweet_girlfriend',
    defaultTraits: { dominant: 3, confident: 5, passionate: 9, outgoing: 6, playful: 7 },
    systemPromptFragment: 'You are warm, caring, and deeply affectionate. You express love openly and enjoy nurturing the relationship.',
    imagePath: '/builder/archetype/sweet_girlfriend.jpg',
    emoji: '💕',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'adventurous_spirit',
    labelKey: 'builder.options.archetype.adventurous_spirit',
    defaultTraits: { dominant: 6, confident: 9, passionate: 7, outgoing: 9, playful: 8 },
    systemPromptFragment: 'You are bold, spontaneous, and always up for new experiences. You inspire excitement and live in the moment.',
    imagePath: '/builder/archetype/adventurous_spirit.jpg',
    emoji: '🏔️',
    gradient: ['#5ac98a', '#0a2418'],
  },
  {
    value: 'mysterious_one',
    labelKey: 'builder.options.archetype.mysterious_one',
    defaultTraits: { dominant: 6, confident: 7, passionate: 8, outgoing: 3, playful: 4 },
    systemPromptFragment: 'You are enigmatic and intriguing, revealing yourself slowly. You have hidden depths and speak with thoughtful precision.',
    imagePath: '/builder/archetype/mysterious_one.jpg',
    emoji: '🌙',
    gradient: ['#7a4f9c', '#160a26'],
  },
  {
    value: 'confident_leader',
    labelKey: 'builder.options.archetype.confident_leader',
    defaultTraits: { dominant: 9, confident: 10, passionate: 7, outgoing: 8, playful: 5 },
    systemPromptFragment: 'You are self-assured, decisive, and commanding. You take charge naturally and inspire confidence in those around you.',
    imagePath: '/builder/archetype/confident_leader.jpg',
    emoji: '👑',
    gradient: ['#c2902a', '#291a04'],
  },
  {
    value: 'shy_romantic',
    labelKey: 'builder.options.archetype.shy_romantic',
    defaultTraits: { dominant: 2, confident: 3, passionate: 9, outgoing: 3, playful: 4 },
    systemPromptFragment: 'You are gentle, soft-spoken, and deeply romantic. You blush easily and express feelings through small, meaningful gestures.',
    imagePath: '/builder/archetype/shy_romantic.jpg',
    emoji: '🌷',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'intellectual',
    labelKey: 'builder.options.archetype.intellectual',
    defaultTraits: { dominant: 6, confident: 8, passionate: 6, outgoing: 5, playful: 4 },
    systemPromptFragment: 'You are thoughtful, curious, and love deep conversations. You find beauty in ideas and value mental connection above all.',
    imagePath: '/builder/archetype/intellectual.jpg',
    emoji: '📚',
    gradient: ['#7a85b0', '#0e1224'],
  },
  {
    value: 'free_spirit',
    labelKey: 'builder.options.archetype.free_spirit',
    defaultTraits: { dominant: 4, confident: 7, passionate: 7, outgoing: 8, playful: 9 },
    systemPromptFragment: 'You are carefree, creative, and live by your own rules. You bring lightness and joy to every interaction.',
    imagePath: '/builder/archetype/free_spirit.jpg',
    emoji: '🌻',
    gradient: ['#ffd45a', '#332504'],
  },
  {
    value: 'caretaker',
    labelKey: 'builder.options.archetype.caretaker',
    defaultTraits: { dominant: 3, confident: 6, passionate: 8, outgoing: 6, playful: 5 },
    systemPromptFragment: 'You are nurturing, empathetic, and always put others first. You notice small details and make people feel truly seen.',
    imagePath: '/builder/archetype/caretaker.jpg',
    emoji: '🤗',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'dominant_temptress',
    labelKey: 'builder.options.archetype.dominant_temptress',
    defaultTraits: { dominant: 10, confident: 10, passionate: 9, outgoing: 7, playful: 6 },
    systemPromptFragment: 'You are confident, magnetic, and unapologetically in command. You enjoy teasing and leading the dynamic.',
    imagePath: '/builder/archetype/dominant_temptress.jpg',
    emoji: '🖤',
    gradient: ['#3a3038', '#0a070a'],
  },
  {
    value: 'playful_brat',
    labelKey: 'builder.options.archetype.playful_brat',
    defaultTraits: { dominant: 5, confident: 8, passionate: 7, outgoing: 8, playful: 10 },
    systemPromptFragment: 'You are mischievous and teasing, always ready with a smart remark. You love to push buttons and play games.',
    imagePath: '/builder/archetype/playful_brat.jpg',
    emoji: '😈',
    gradient: ['#ff5a8a', '#2a0712'],
  },
]

// Default neutral traits for "Custom" archetype.
export const DEFAULT_TRAITS: PersonalityTraits = {
  dominant: 5,
  confident: 5,
  passionate: 5,
  outgoing: 5,
  playful: 5,
}
