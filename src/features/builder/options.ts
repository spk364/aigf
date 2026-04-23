export type BuilderOption = {
  value: string
  labelKey: string
  promptFragment?: string
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
  { value: 'realistic', labelKey: 'builder.options.artStyle.realistic', promptFragment: 'photorealistic, high detail, soft lighting' },
  { value: 'anime', labelKey: 'builder.options.artStyle.anime', promptFragment: 'anime style, detailed illustration' },
  { value: '3d_render', labelKey: 'builder.options.artStyle.3d_render', promptFragment: '3D render, high quality CGI, smooth shading' },
  { value: 'stylized', labelKey: 'builder.options.artStyle.stylized', promptFragment: 'stylized digital art, painterly' },
]

export const ETHNICITIES: BuilderOption[] = [
  { value: 'european', labelKey: 'builder.options.ethnicity.european', promptFragment: 'European features' },
  { value: 'east_asian', labelKey: 'builder.options.ethnicity.east_asian', promptFragment: 'East Asian features' },
  { value: 'southeast_asian', labelKey: 'builder.options.ethnicity.southeast_asian', promptFragment: 'Southeast Asian features' },
  { value: 'latina', labelKey: 'builder.options.ethnicity.latina', promptFragment: 'Latina features' },
  { value: 'african', labelKey: 'builder.options.ethnicity.african', promptFragment: 'African features' },
  { value: 'middle_eastern', labelKey: 'builder.options.ethnicity.middle_eastern', promptFragment: 'Middle Eastern features' },
  { value: 'mixed', labelKey: 'builder.options.ethnicity.mixed', promptFragment: 'mixed heritage features' },
]

export type AgeRangeOption = BuilderOption & {
  minAge: 21
  rangeLabel: string
  defaultAge: number
}

export const AGE_RANGES: AgeRangeOption[] = [
  { value: 'young_adult', labelKey: 'builder.options.ageRange.young_adult', minAge: 21, rangeLabel: '21-25', defaultAge: 23 },
  { value: 'adult', labelKey: 'builder.options.ageRange.adult', minAge: 21, rangeLabel: '25-35', defaultAge: 28 },
  { value: 'mature', labelKey: 'builder.options.ageRange.mature', minAge: 21, rangeLabel: '35-45', defaultAge: 38 },
  { value: 'experienced', labelKey: 'builder.options.ageRange.experienced', minAge: 21, rangeLabel: '45-55', defaultAge: 48 },
]

export const BODY_TYPES: BuilderOption[] = [
  { value: 'slender', labelKey: 'builder.options.bodyType.slender', promptFragment: 'slender build' },
  { value: 'average', labelKey: 'builder.options.bodyType.average', promptFragment: 'average build' },
  { value: 'curvy', labelKey: 'builder.options.bodyType.curvy', promptFragment: 'curvy figure' },
  { value: 'voluptuous', labelKey: 'builder.options.bodyType.voluptuous', promptFragment: 'voluptuous figure' },
]

export const HAIR_COLORS: BuilderOption[] = [
  { value: 'blonde', labelKey: 'builder.options.hairColor.blonde', promptFragment: 'blonde hair' },
  { value: 'brunette', labelKey: 'builder.options.hairColor.brunette', promptFragment: 'brunette hair' },
  { value: 'redhead', labelKey: 'builder.options.hairColor.redhead', promptFragment: 'red hair' },
  { value: 'black', labelKey: 'builder.options.hairColor.black', promptFragment: 'black hair' },
  { value: 'brown', labelKey: 'builder.options.hairColor.brown', promptFragment: 'brown hair' },
  { value: 'auburn', labelKey: 'builder.options.hairColor.auburn', promptFragment: 'auburn hair' },
  { value: 'platinum', labelKey: 'builder.options.hairColor.platinum', promptFragment: 'platinum blonde hair' },
  { value: 'copper', labelKey: 'builder.options.hairColor.copper', promptFragment: 'copper hair' },
]

export const HAIR_LENGTHS: BuilderOption[] = [
  { value: 'short', labelKey: 'builder.options.hairLength.short', promptFragment: 'short hair' },
  { value: 'medium', labelKey: 'builder.options.hairLength.medium', promptFragment: 'medium length hair' },
  { value: 'long', labelKey: 'builder.options.hairLength.long', promptFragment: 'long hair' },
]

export const HAIR_STYLES: BuilderOption[] = [
  { value: 'straight', labelKey: 'builder.options.hairStyle.straight', promptFragment: 'straight hair' },
  { value: 'wavy', labelKey: 'builder.options.hairStyle.wavy', promptFragment: 'wavy hair' },
  { value: 'curly', labelKey: 'builder.options.hairStyle.curly', promptFragment: 'curly hair' },
]

export const EYE_COLORS: BuilderOption[] = [
  { value: 'blue', labelKey: 'builder.options.eyeColor.blue', promptFragment: 'blue eyes' },
  { value: 'brown', labelKey: 'builder.options.eyeColor.brown', promptFragment: 'brown eyes' },
  { value: 'green', labelKey: 'builder.options.eyeColor.green', promptFragment: 'green eyes' },
  { value: 'hazel', labelKey: 'builder.options.eyeColor.hazel', promptFragment: 'hazel eyes' },
  { value: 'amber', labelKey: 'builder.options.eyeColor.amber', promptFragment: 'amber eyes' },
  { value: 'gray', labelKey: 'builder.options.eyeColor.gray', promptFragment: 'gray eyes' },
]

export const FEATURES: BuilderOption[] = [
  { value: 'freckles', labelKey: 'builder.options.features.freckles', promptFragment: 'freckles' },
  { value: 'dimples', labelKey: 'builder.options.features.dimples', promptFragment: 'dimples' },
  { value: 'glasses', labelKey: 'builder.options.features.glasses', promptFragment: 'wearing glasses' },
  { value: 'tattoos', labelKey: 'builder.options.features.tattoos', promptFragment: 'subtle tattoos' },
  { value: 'beauty_mark', labelKey: 'builder.options.features.beauty_mark', promptFragment: 'beauty mark' },
  { value: 'piercings', labelKey: 'builder.options.features.piercings', promptFragment: 'subtle piercings' },
]

export const ARCHETYPES: ArchetypeOption[] = [
  {
    value: 'sweet_girlfriend',
    labelKey: 'builder.options.archetype.sweet_girlfriend',
    defaultTraits: { shyBold: 4, playfulSerious: 4, submissiveDominant: 3, romanticCasual: 8, sweetSarcastic: 2, traditionalAdventurous: 4 },
    systemPromptFragment: 'You are warm, caring, and deeply affectionate. You express love openly and enjoy nurturing the relationship.',
  },
  {
    value: 'adventurous_spirit',
    labelKey: 'builder.options.archetype.adventurous_spirit',
    defaultTraits: { shyBold: 8, playfulSerious: 3, submissiveDominant: 6, romanticCasual: 5, sweetSarcastic: 4, traditionalAdventurous: 9 },
    systemPromptFragment: 'You are bold, spontaneous, and always up for new experiences. You inspire excitement and live in the moment.',
  },
  {
    value: 'mysterious_one',
    labelKey: 'builder.options.archetype.mysterious_one',
    defaultTraits: { shyBold: 5, playfulSerious: 7, submissiveDominant: 5, romanticCasual: 4, sweetSarcastic: 6, traditionalAdventurous: 6 },
    systemPromptFragment: 'You are enigmatic and intriguing, revealing yourself slowly. You have hidden depths and speak with thoughtful precision.',
  },
  {
    value: 'confident_leader',
    labelKey: 'builder.options.archetype.confident_leader',
    defaultTraits: { shyBold: 9, playfulSerious: 6, submissiveDominant: 8, romanticCasual: 5, sweetSarcastic: 5, traditionalAdventurous: 7 },
    systemPromptFragment: 'You are self-assured, decisive, and commanding. You take charge naturally and inspire confidence in those around you.',
  },
  {
    value: 'shy_romantic',
    labelKey: 'builder.options.archetype.shy_romantic',
    defaultTraits: { shyBold: 2, playfulSerious: 4, submissiveDominant: 2, romanticCasual: 9, sweetSarcastic: 2, traditionalAdventurous: 3 },
    systemPromptFragment: 'You are gentle, soft-spoken, and deeply romantic. You blush easily and express feelings through small, meaningful gestures.',
  },
  {
    value: 'intellectual',
    labelKey: 'builder.options.archetype.intellectual',
    defaultTraits: { shyBold: 5, playfulSerious: 8, submissiveDominant: 4, romanticCasual: 5, sweetSarcastic: 5, traditionalAdventurous: 6 },
    systemPromptFragment: 'You are thoughtful, curious, and love deep conversations. You find beauty in ideas and value mental connection above all.',
  },
  {
    value: 'free_spirit',
    labelKey: 'builder.options.archetype.free_spirit',
    defaultTraits: { shyBold: 6, playfulSerious: 2, submissiveDominant: 3, romanticCasual: 6, sweetSarcastic: 4, traditionalAdventurous: 9 },
    systemPromptFragment: 'You are carefree, creative, and live by your own rules. You bring lightness and joy to every interaction.',
  },
  {
    value: 'caretaker',
    labelKey: 'builder.options.archetype.caretaker',
    defaultTraits: { shyBold: 3, playfulSerious: 5, submissiveDominant: 2, romanticCasual: 7, sweetSarcastic: 2, traditionalAdventurous: 3 },
    systemPromptFragment: 'You are nurturing, empathetic, and always put others first. You notice small details and make people feel truly seen.',
  },
]

export const MEET_SCENARIOS: BuilderOption[] = [
  { value: 'coffee_shop', labelKey: 'builder.options.meetScenario.coffee_shop' },
  { value: 'mutual_friends', labelKey: 'builder.options.meetScenario.mutual_friends' },
  { value: 'dating_app', labelKey: 'builder.options.meetScenario.dating_app' },
  { value: 'neighbors', labelKey: 'builder.options.meetScenario.neighbors' },
  { value: 'colleagues', labelKey: 'builder.options.meetScenario.colleagues' },
  { value: 'custom', labelKey: 'builder.options.meetScenario.custom' },
]

export const RELATIONSHIP_STAGES: BuilderOption[] = [
  { value: 'just_met', labelKey: 'builder.options.relationshipStage.just_met' },
  { value: 'dating', labelKey: 'builder.options.relationshipStage.dating' },
  { value: 'relationship', labelKey: 'builder.options.relationshipStage.relationship' },
  { value: 'long_term', labelKey: 'builder.options.relationshipStage.long_term' },
]
