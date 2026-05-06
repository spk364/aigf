// Options for the character builder. Each option carries a stable `value` (the
// only thing persisted in the draft / character JSON), an i18n `labelKey`, an
// optional `promptFragment` injected into Stable Diffusion prompts, and visual
// metadata used by the image-card UI:
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

export type PersonalityTraits = {
  shyBold: number
  playfulSerious: number
  submissiveDominant: number
  romanticCasual: number
  sweetSarcastic: number
  traditionalAdventurous: number
}

export type ArchetypeOption = BuilderOption & {
  defaultTraits: PersonalityTraits
  systemPromptFragment: string
}

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
  {
    value: '3d_render',
    labelKey: 'builder.options.artStyle.3d_render',
    promptFragment: '3D render, high quality CGI, smooth shading',
    imagePath: '/builder/art-style/3d_render.jpg',
    emoji: '🎮',
    gradient: ['#7a8bff', '#11173b'],
  },
  {
    value: 'stylized',
    labelKey: 'builder.options.artStyle.stylized',
    promptFragment: 'stylized digital art, painterly',
    imagePath: '/builder/art-style/stylized.jpg',
    emoji: '🎨',
    gradient: ['#b07aff', '#1f1138'],
  },
]

export const ETHNICITIES: BuilderOption[] = [
  {
    value: 'european',
    labelKey: 'builder.options.ethnicity.european',
    promptFragment: 'European features',
    imagePath: '/builder/ethnicity/european.jpg',
    emoji: '🇪🇺',
    gradient: ['#d6b89a', '#3a2a1a'],
  },
  {
    value: 'east_asian',
    labelKey: 'builder.options.ethnicity.east_asian',
    promptFragment: 'East Asian features',
    imagePath: '/builder/ethnicity/east_asian.jpg',
    emoji: '🏮',
    gradient: ['#e8b58a', '#3a1f1a'],
  },
  {
    value: 'southeast_asian',
    labelKey: 'builder.options.ethnicity.southeast_asian',
    promptFragment: 'Southeast Asian features',
    imagePath: '/builder/ethnicity/southeast_asian.jpg',
    emoji: '🌴',
    gradient: ['#caa078', '#2c1d12'],
  },
  {
    value: 'latina',
    labelKey: 'builder.options.ethnicity.latina',
    promptFragment: 'Latina features',
    imagePath: '/builder/ethnicity/latina.jpg',
    emoji: '💃',
    gradient: ['#c9805d', '#2b1612'],
  },
  {
    value: 'african',
    labelKey: 'builder.options.ethnicity.african',
    promptFragment: 'African features',
    imagePath: '/builder/ethnicity/african.jpg',
    emoji: '🌍',
    gradient: ['#8a533a', '#1a0c08'],
  },
  {
    value: 'middle_eastern',
    labelKey: 'builder.options.ethnicity.middle_eastern',
    promptFragment: 'Middle Eastern features',
    imagePath: '/builder/ethnicity/middle_eastern.jpg',
    emoji: '🕌',
    gradient: ['#b88860', '#241710'],
  },
  {
    value: 'mixed',
    labelKey: 'builder.options.ethnicity.mixed',
    promptFragment: 'mixed heritage features',
    imagePath: '/builder/ethnicity/mixed.jpg',
    emoji: '✨',
    gradient: ['#d399b3', '#2c1424'],
  },
]

export type AgeRangeOption = BuilderOption & {
  minAge: 21
  rangeLabel: string
  defaultAge: number
}

export const AGE_RANGES: AgeRangeOption[] = [
  {
    value: 'young_adult',
    labelKey: 'builder.options.ageRange.young_adult',
    minAge: 21,
    rangeLabel: '21-25',
    defaultAge: 23,
    imagePath: '/builder/age/young_adult.jpg',
    emoji: '🌱',
    gradient: ['#ff9bcc', '#3a1530'],
  },
  {
    value: 'adult',
    labelKey: 'builder.options.ageRange.adult',
    minAge: 21,
    rangeLabel: '25-35',
    defaultAge: 28,
    imagePath: '/builder/age/adult.jpg',
    emoji: '🌹',
    gradient: ['#ff7da3', '#3a1421'],
  },
  {
    value: 'mature',
    labelKey: 'builder.options.ageRange.mature',
    minAge: 21,
    rangeLabel: '35-45',
    defaultAge: 38,
    imagePath: '/builder/age/mature.jpg',
    emoji: '🍷',
    gradient: ['#b85c75', '#2c0e1a'],
  },
  {
    value: 'experienced',
    labelKey: 'builder.options.ageRange.experienced',
    minAge: 21,
    rangeLabel: '45-55',
    defaultAge: 48,
    imagePath: '/builder/age/experienced.jpg',
    emoji: '🥂',
    gradient: ['#8e5a78', '#1f0f1a'],
  },
]

export const BODY_TYPES: BuilderOption[] = [
  {
    value: 'slender',
    labelKey: 'builder.options.bodyType.slender',
    promptFragment: 'slender build, slim figure',
    imagePath: '/builder/body-type/slender.jpg',
    emoji: '🌿',
    gradient: ['#a8c2e0', '#0f1d2e'],
  },
  {
    value: 'athletic',
    labelKey: 'builder.options.bodyType.athletic',
    promptFragment: 'athletic build, toned figure, fit body',
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
    promptFragment: 'curvy figure, hourglass shape',
    imagePath: '/builder/body-type/curvy.jpg',
    emoji: '⏳',
    gradient: ['#ff8aa6', '#3a1421'],
  },
  {
    value: 'voluptuous',
    labelKey: 'builder.options.bodyType.voluptuous',
    promptFragment: 'voluptuous figure, full curves, thick body',
    imagePath: '/builder/body-type/voluptuous.jpg',
    emoji: '🍑',
    gradient: ['#ff6b8e', '#330b18'],
  },
  {
    value: 'plus_size',
    labelKey: 'builder.options.bodyType.plus_size',
    promptFragment: 'plus-size figure, full-bodied',
    imagePath: '/builder/body-type/plus_size.jpg',
    emoji: '💖',
    gradient: ['#e07ab0', '#2c0f22'],
  },
]

export const BREAST_SIZES: BuilderOption[] = [
  {
    value: 'small',
    labelKey: 'builder.options.breastSize.small',
    promptFragment: 'small bust, modest chest',
    imagePath: '/builder/breast-size/small.jpg',
    emoji: '🤍',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'medium',
    labelKey: 'builder.options.breastSize.medium',
    promptFragment: 'medium bust, balanced chest',
    imagePath: '/builder/breast-size/medium.jpg',
    emoji: '💗',
    gradient: ['#e8a0bc', '#2a1220'],
  },
  {
    value: 'large',
    labelKey: 'builder.options.breastSize.large',
    promptFragment: 'large bust, full chest',
    imagePath: '/builder/breast-size/large.jpg',
    emoji: '💞',
    gradient: ['#ff7fae', '#330e1f'],
  },
  {
    value: 'huge',
    labelKey: 'builder.options.breastSize.huge',
    promptFragment: 'very large bust, busty figure',
    imagePath: '/builder/breast-size/huge.jpg',
    emoji: '🔥',
    gradient: ['#ff5a8a', '#2a0712'],
  },
]

export const BUTT_SIZES: BuilderOption[] = [
  {
    value: 'small',
    labelKey: 'builder.options.buttSize.small',
    promptFragment: 'small narrow hips, slim rear',
    imagePath: '/builder/butt-size/small.jpg',
    emoji: '🤍',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'medium',
    labelKey: 'builder.options.buttSize.medium',
    promptFragment: 'medium hips, balanced rear',
    imagePath: '/builder/butt-size/medium.jpg',
    emoji: '💗',
    gradient: ['#e8a0bc', '#2a1220'],
  },
  {
    value: 'large',
    labelKey: 'builder.options.buttSize.large',
    promptFragment: 'large round hips, full rear',
    imagePath: '/builder/butt-size/large.jpg',
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

export const HIP_SHAPES: BuilderOption[] = [
  {
    value: 'narrow',
    labelKey: 'builder.options.hipShape.narrow',
    promptFragment: 'narrow hips, straight figure',
    imagePath: '/builder/hip-shape/narrow.jpg',
    emoji: '📏',
    gradient: ['#9bb5d0', '#0e1822'],
  },
  {
    value: 'average',
    labelKey: 'builder.options.hipShape.average',
    promptFragment: 'average hips',
    imagePath: '/builder/hip-shape/average.jpg',
    emoji: '🧍‍♀️',
    gradient: ['#cfb89a', '#2c2218'],
  },
  {
    value: 'wide',
    labelKey: 'builder.options.hipShape.wide',
    promptFragment: 'wide hips, hourglass figure',
    imagePath: '/builder/hip-shape/wide.jpg',
    emoji: '⏳',
    gradient: ['#ff8aa6', '#3a1421'],
  },
]

export const SKIN_TONES: BuilderOption[] = [
  {
    value: 'porcelain',
    labelKey: 'builder.options.skinTone.porcelain',
    promptFragment: 'porcelain pale skin',
    imagePath: '/builder/skin-tone/porcelain.jpg',
    emoji: '🤍',
    gradient: ['#f3dfd1', '#2a201c'],
  },
  {
    value: 'fair',
    labelKey: 'builder.options.skinTone.fair',
    promptFragment: 'fair skin',
    imagePath: '/builder/skin-tone/fair.jpg',
    emoji: '🌼',
    gradient: ['#e8c5a8', '#2c1f16'],
  },
  {
    value: 'olive',
    labelKey: 'builder.options.skinTone.olive',
    promptFragment: 'olive skin',
    imagePath: '/builder/skin-tone/olive.jpg',
    emoji: '🫒',
    gradient: ['#caa07a', '#251710'],
  },
  {
    value: 'tan',
    labelKey: 'builder.options.skinTone.tan',
    promptFragment: 'tan skin, sun-kissed',
    imagePath: '/builder/skin-tone/tan.jpg',
    emoji: '🌅',
    gradient: ['#b07a52', '#21130a'],
  },
  {
    value: 'brown',
    labelKey: 'builder.options.skinTone.brown',
    promptFragment: 'brown skin',
    imagePath: '/builder/skin-tone/brown.jpg',
    emoji: '🤎',
    gradient: ['#8a5232', '#1a0c06'],
  },
  {
    value: 'dark',
    labelKey: 'builder.options.skinTone.dark',
    promptFragment: 'dark skin, deep complexion',
    imagePath: '/builder/skin-tone/dark.jpg',
    emoji: '🖤',
    gradient: ['#5e3422', '#120705'],
  },
]

export const HAIR_COLORS: BuilderOption[] = [
  {
    value: 'blonde',
    labelKey: 'builder.options.hairColor.blonde',
    promptFragment: 'blonde hair',
    imagePath: '/builder/hair-color/blonde.jpg',
    emoji: '👱‍♀️',
    gradient: ['#f0d28a', '#3a2f10'],
  },
  {
    value: 'platinum',
    labelKey: 'builder.options.hairColor.platinum',
    promptFragment: 'platinum blonde hair, almost white',
    imagePath: '/builder/hair-color/platinum.jpg',
    emoji: '✨',
    gradient: ['#f5e8d0', '#2c2418'],
  },
  {
    value: 'brunette',
    labelKey: 'builder.options.hairColor.brunette',
    promptFragment: 'brunette hair, dark brown',
    imagePath: '/builder/hair-color/brunette.jpg',
    emoji: '🌰',
    gradient: ['#7a4a30', '#1a0c06'],
  },
  {
    value: 'brown',
    labelKey: 'builder.options.hairColor.brown',
    promptFragment: 'brown hair',
    imagePath: '/builder/hair-color/brown.jpg',
    emoji: '🪵',
    gradient: ['#8a5a3a', '#1f1108'],
  },
  {
    value: 'auburn',
    labelKey: 'builder.options.hairColor.auburn',
    promptFragment: 'auburn hair, reddish brown',
    imagePath: '/builder/hair-color/auburn.jpg',
    emoji: '🍁',
    gradient: ['#a04a30', '#220906'],
  },
  {
    value: 'redhead',
    labelKey: 'builder.options.hairColor.redhead',
    promptFragment: 'red hair, vivid ginger',
    imagePath: '/builder/hair-color/redhead.jpg',
    emoji: '🦊',
    gradient: ['#d04a20', '#290804'],
  },
  {
    value: 'copper',
    labelKey: 'builder.options.hairColor.copper',
    promptFragment: 'copper hair, warm orange',
    imagePath: '/builder/hair-color/copper.jpg',
    emoji: '🔥',
    gradient: ['#c2602a', '#290e04'],
  },
  {
    value: 'black',
    labelKey: 'builder.options.hairColor.black',
    promptFragment: 'jet black hair',
    imagePath: '/builder/hair-color/black.jpg',
    emoji: '🖤',
    gradient: ['#3a3038', '#0a070a'],
  },
]

export const HAIR_LENGTHS: BuilderOption[] = [
  {
    value: 'short',
    labelKey: 'builder.options.hairLength.short',
    promptFragment: 'short hair',
    imagePath: '/builder/hair-length/short.jpg',
    emoji: '💇‍♀️',
    gradient: ['#b89aff', '#1c1140'],
  },
  {
    value: 'medium',
    labelKey: 'builder.options.hairLength.medium',
    promptFragment: 'medium length hair, shoulder-length',
    imagePath: '/builder/hair-length/medium.jpg',
    emoji: '👩',
    gradient: ['#9aa5ff', '#101140'],
  },
  {
    value: 'long',
    labelKey: 'builder.options.hairLength.long',
    promptFragment: 'long flowing hair',
    imagePath: '/builder/hair-length/long.jpg',
    emoji: '💁‍♀️',
    gradient: ['#7a82ff', '#0e0e3a'],
  },
]

export const HAIR_STYLES: BuilderOption[] = [
  {
    value: 'straight',
    labelKey: 'builder.options.hairStyle.straight',
    promptFragment: 'straight hair',
    imagePath: '/builder/hair-style/straight.jpg',
    emoji: '➖',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'wavy',
    labelKey: 'builder.options.hairStyle.wavy',
    promptFragment: 'wavy hair, soft waves',
    imagePath: '/builder/hair-style/wavy.jpg',
    emoji: '🌊',
    gradient: ['#85c0e0', '#091924'],
  },
  {
    value: 'curly',
    labelKey: 'builder.options.hairStyle.curly',
    promptFragment: 'curly hair, voluminous curls',
    imagePath: '/builder/hair-style/curly.jpg',
    emoji: '🌀',
    gradient: ['#b07aff', '#1f1138'],
  },
  {
    value: 'ponytail',
    labelKey: 'builder.options.hairStyle.ponytail',
    promptFragment: 'hair in a ponytail',
    imagePath: '/builder/hair-style/ponytail.jpg',
    emoji: '🎀',
    gradient: ['#ff90b8', '#330d22'],
  },
  {
    value: 'braided',
    labelKey: 'builder.options.hairStyle.braided',
    promptFragment: 'braided hair',
    imagePath: '/builder/hair-style/braided.jpg',
    emoji: '🪢',
    gradient: ['#a86f4a', '#22120a'],
  },
  {
    value: 'bun',
    labelKey: 'builder.options.hairStyle.bun',
    promptFragment: 'hair in a bun, hair tied up',
    imagePath: '/builder/hair-style/bun.jpg',
    emoji: '🍡',
    gradient: ['#d6a48e', '#2a1810'],
  },
]

export const EYE_COLORS: BuilderOption[] = [
  {
    value: 'blue',
    labelKey: 'builder.options.eyeColor.blue',
    promptFragment: 'blue eyes',
    imagePath: '/builder/eye-color/blue.jpg',
    emoji: '💙',
    gradient: ['#5aa8ff', '#091a3a'],
  },
  {
    value: 'brown',
    labelKey: 'builder.options.eyeColor.brown',
    promptFragment: 'brown eyes',
    imagePath: '/builder/eye-color/brown.jpg',
    emoji: '🤎',
    gradient: ['#8a5a3a', '#1f1108'],
  },
  {
    value: 'green',
    labelKey: 'builder.options.eyeColor.green',
    promptFragment: 'green eyes',
    imagePath: '/builder/eye-color/green.jpg',
    emoji: '💚',
    gradient: ['#5ac98a', '#0a2418'],
  },
  {
    value: 'hazel',
    labelKey: 'builder.options.eyeColor.hazel',
    promptFragment: 'hazel eyes',
    imagePath: '/builder/eye-color/hazel.jpg',
    emoji: '🌰',
    gradient: ['#a87a4a', '#221408'],
  },
  {
    value: 'amber',
    labelKey: 'builder.options.eyeColor.amber',
    promptFragment: 'amber eyes',
    imagePath: '/builder/eye-color/amber.jpg',
    emoji: '🟠',
    gradient: ['#ff9a3a', '#2a0e04'],
  },
  {
    value: 'gray',
    labelKey: 'builder.options.eyeColor.gray',
    promptFragment: 'gray eyes',
    imagePath: '/builder/eye-color/gray.jpg',
    emoji: '🩶',
    gradient: ['#a3b0bc', '#0f1418'],
  },
  {
    value: 'violet',
    labelKey: 'builder.options.eyeColor.violet',
    promptFragment: 'violet eyes',
    imagePath: '/builder/eye-color/violet.jpg',
    emoji: '💜',
    gradient: ['#b07aff', '#1f1138'],
  },
]

export const FEATURES: BuilderOption[] = [
  {
    value: 'freckles',
    labelKey: 'builder.options.features.freckles',
    promptFragment: 'freckles across the nose',
    imagePath: '/builder/features/freckles.jpg',
    emoji: '🌟',
    gradient: ['#d4a075', '#2a160c'],
  },
  {
    value: 'dimples',
    labelKey: 'builder.options.features.dimples',
    promptFragment: 'dimples when smiling',
    imagePath: '/builder/features/dimples.jpg',
    emoji: '😊',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'glasses',
    labelKey: 'builder.options.features.glasses',
    promptFragment: 'wearing glasses',
    imagePath: '/builder/features/glasses.jpg',
    emoji: '🤓',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'tattoos',
    labelKey: 'builder.options.features.tattoos',
    promptFragment: 'tasteful tattoos',
    imagePath: '/builder/features/tattoos.jpg',
    emoji: '🦋',
    gradient: ['#7a85b0', '#0e1224'],
  },
  {
    value: 'beauty_mark',
    labelKey: 'builder.options.features.beauty_mark',
    promptFragment: 'a small beauty mark',
    imagePath: '/builder/features/beauty_mark.jpg',
    emoji: '🎯',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'piercings',
    labelKey: 'builder.options.features.piercings',
    promptFragment: 'subtle piercings',
    imagePath: '/builder/features/piercings.jpg',
    emoji: '💎',
    gradient: ['#a3b6cc', '#0f1a26'],
  },
  {
    value: 'lip_piercing',
    labelKey: 'builder.options.features.lip_piercing',
    promptFragment: 'a small lip piercing',
    imagePath: '/builder/features/lip_piercing.jpg',
    emoji: '💋',
    gradient: ['#ff7fae', '#330e1f'],
  },
  {
    value: 'septum',
    labelKey: 'builder.options.features.septum',
    promptFragment: 'a septum piercing',
    imagePath: '/builder/features/septum.jpg',
    emoji: '⚜️',
    gradient: ['#c2902a', '#291a04'],
  },
]

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: 'sweet_girlfriend',
    labelKey: 'builder.options.archetype.sweet_girlfriend',
    defaultTraits: { shyBold: 4, playfulSerious: 4, submissiveDominant: 3, romanticCasual: 8, sweetSarcastic: 2, traditionalAdventurous: 4 },
    systemPromptFragment: 'You are warm, caring, and deeply affectionate. You express love openly and enjoy nurturing the relationship.',
    imagePath: '/builder/archetype/sweet_girlfriend.jpg',
    emoji: '💕',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'adventurous_spirit',
    labelKey: 'builder.options.archetype.adventurous_spirit',
    defaultTraits: { shyBold: 8, playfulSerious: 3, submissiveDominant: 6, romanticCasual: 5, sweetSarcastic: 4, traditionalAdventurous: 9 },
    systemPromptFragment: 'You are bold, spontaneous, and always up for new experiences. You inspire excitement and live in the moment.',
    imagePath: '/builder/archetype/adventurous_spirit.jpg',
    emoji: '🏔️',
    gradient: ['#5ac98a', '#0a2418'],
  },
  {
    value: 'mysterious_one',
    labelKey: 'builder.options.archetype.mysterious_one',
    defaultTraits: { shyBold: 5, playfulSerious: 7, submissiveDominant: 5, romanticCasual: 4, sweetSarcastic: 6, traditionalAdventurous: 6 },
    systemPromptFragment: 'You are enigmatic and intriguing, revealing yourself slowly. You have hidden depths and speak with thoughtful precision.',
    imagePath: '/builder/archetype/mysterious_one.jpg',
    emoji: '🌙',
    gradient: ['#7a4f9c', '#160a26'],
  },
  {
    value: 'confident_leader',
    labelKey: 'builder.options.archetype.confident_leader',
    defaultTraits: { shyBold: 9, playfulSerious: 6, submissiveDominant: 8, romanticCasual: 5, sweetSarcastic: 5, traditionalAdventurous: 7 },
    systemPromptFragment: 'You are self-assured, decisive, and commanding. You take charge naturally and inspire confidence in those around you.',
    imagePath: '/builder/archetype/confident_leader.jpg',
    emoji: '👑',
    gradient: ['#c2902a', '#291a04'],
  },
  {
    value: 'shy_romantic',
    labelKey: 'builder.options.archetype.shy_romantic',
    defaultTraits: { shyBold: 2, playfulSerious: 4, submissiveDominant: 2, romanticCasual: 9, sweetSarcastic: 2, traditionalAdventurous: 3 },
    systemPromptFragment: 'You are gentle, soft-spoken, and deeply romantic. You blush easily and express feelings through small, meaningful gestures.',
    imagePath: '/builder/archetype/shy_romantic.jpg',
    emoji: '🌷',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'intellectual',
    labelKey: 'builder.options.archetype.intellectual',
    defaultTraits: { shyBold: 5, playfulSerious: 8, submissiveDominant: 4, romanticCasual: 5, sweetSarcastic: 5, traditionalAdventurous: 6 },
    systemPromptFragment: 'You are thoughtful, curious, and love deep conversations. You find beauty in ideas and value mental connection above all.',
    imagePath: '/builder/archetype/intellectual.jpg',
    emoji: '📚',
    gradient: ['#7a85b0', '#0e1224'],
  },
  {
    value: 'free_spirit',
    labelKey: 'builder.options.archetype.free_spirit',
    defaultTraits: { shyBold: 6, playfulSerious: 2, submissiveDominant: 3, romanticCasual: 6, sweetSarcastic: 4, traditionalAdventurous: 9 },
    systemPromptFragment: 'You are carefree, creative, and live by your own rules. You bring lightness and joy to every interaction.',
    imagePath: '/builder/archetype/free_spirit.jpg',
    emoji: '🌻',
    gradient: ['#ffd45a', '#332504'],
  },
  {
    value: 'caretaker',
    labelKey: 'builder.options.archetype.caretaker',
    defaultTraits: { shyBold: 3, playfulSerious: 5, submissiveDominant: 2, romanticCasual: 7, sweetSarcastic: 2, traditionalAdventurous: 3 },
    systemPromptFragment: 'You are nurturing, empathetic, and always put others first. You notice small details and make people feel truly seen.',
    imagePath: '/builder/archetype/caretaker.jpg',
    emoji: '🤗',
    gradient: ['#ffb0c4', '#330d22'],
  },
  {
    value: 'dominant_temptress',
    labelKey: 'builder.options.archetype.dominant_temptress',
    defaultTraits: { shyBold: 9, playfulSerious: 6, submissiveDominant: 9, romanticCasual: 5, sweetSarcastic: 7, traditionalAdventurous: 8 },
    systemPromptFragment: 'You are confident, magnetic, and unapologetically in command. You enjoy teasing and leading the dynamic.',
    imagePath: '/builder/archetype/dominant_temptress.jpg',
    emoji: '🖤',
    gradient: ['#3a3038', '#0a070a'],
  },
  {
    value: 'playful_brat',
    labelKey: 'builder.options.archetype.playful_brat',
    defaultTraits: { shyBold: 7, playfulSerious: 1, submissiveDominant: 5, romanticCasual: 4, sweetSarcastic: 8, traditionalAdventurous: 7 },
    systemPromptFragment: 'You are mischievous and teasing, always ready with a smart remark. You love to push buttons and play games.',
    imagePath: '/builder/archetype/playful_brat.jpg',
    emoji: '😈',
    gradient: ['#ff5a8a', '#2a0712'],
  },
]

export const MEET_SCENARIOS: BuilderOption[] = [
  { value: 'coffee_shop', labelKey: 'builder.options.meetScenario.coffee_shop', emoji: '☕', gradient: ['#a86f4a', '#22120a'] },
  { value: 'mutual_friends', labelKey: 'builder.options.meetScenario.mutual_friends', emoji: '🤝', gradient: ['#ffb0c4', '#330d22'] },
  { value: 'dating_app', labelKey: 'builder.options.meetScenario.dating_app', emoji: '💬', gradient: ['#5aa8ff', '#091a3a'] },
  { value: 'neighbors', labelKey: 'builder.options.meetScenario.neighbors', emoji: '🏠', gradient: ['#cfb89a', '#2c2218'] },
  { value: 'colleagues', labelKey: 'builder.options.meetScenario.colleagues', emoji: '💼', gradient: ['#7a85b0', '#0e1224'] },
  { value: 'gym', labelKey: 'builder.options.meetScenario.gym', emoji: '🏋️‍♀️', gradient: ['#9bd0a8', '#0e2418'] },
  { value: 'club', labelKey: 'builder.options.meetScenario.club', emoji: '🪩', gradient: ['#b07aff', '#1f1138'] },
  { value: 'custom', labelKey: 'builder.options.meetScenario.custom', emoji: '✏️', gradient: ['#a3b6cc', '#0f1a26'] },
]

export const RELATIONSHIP_STAGES: BuilderOption[] = [
  { value: 'just_met', labelKey: 'builder.options.relationshipStage.just_met', emoji: '👋', gradient: ['#ffb0c4', '#330d22'] },
  { value: 'dating', labelKey: 'builder.options.relationshipStage.dating', emoji: '💞', gradient: ['#ff7fae', '#330e1f'] },
  { value: 'relationship', labelKey: 'builder.options.relationshipStage.relationship', emoji: '💍', gradient: ['#c2902a', '#291a04'] },
  { value: 'long_term', labelKey: 'builder.options.relationshipStage.long_term', emoji: '🏡', gradient: ['#cfb89a', '#2c2218'] },
]
