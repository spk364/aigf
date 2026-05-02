export type Option = {
  value: string
  label: string
  description?: string
  hue?: number
}

export const STYLE_OPTIONS: Option[] = [
  { value: 'realistic', label: 'Realistic', description: 'Photo-quality, lifelike companion', hue: 290 },
  { value: 'anime', label: 'Anime', description: 'Stylized illustration, expressive', hue: 330 },
  { value: '3d_render', label: '3D', description: 'Smooth 3D-rendered, cinematic', hue: 220 },
]

export const BODY_OPTIONS: Option[] = [
  { value: 'slender', label: 'Slim', description: 'Petite, lithe build', hue: 200 },
  { value: 'average', label: 'Athletic', description: 'Toned, balanced', hue: 160 },
  { value: 'curvy', label: 'Curvy', description: 'Full-figured, soft curves', hue: 340 },
  { value: 'voluptuous', label: 'Voluptuous', description: 'Bold, hourglass', hue: 0 },
]

export const HAIR_COLOR_OPTIONS: Option[] = [
  { value: 'blonde', label: 'Blonde', hue: 50 },
  { value: 'brunette', label: 'Brunette', hue: 25 },
  { value: 'black', label: 'Black', hue: 270 },
  { value: 'redhead', label: 'Red', hue: 10 },
  { value: 'auburn', label: 'Auburn', hue: 20 },
  { value: 'platinum', label: 'Platinum', hue: 60 },
]

export const EYE_COLOR_OPTIONS: Option[] = [
  { value: 'blue', label: 'Blue', hue: 210 },
  { value: 'brown', label: 'Brown', hue: 25 },
  { value: 'green', label: 'Green', hue: 130 },
  { value: 'hazel', label: 'Hazel', hue: 35 },
  { value: 'gray', label: 'Gray', hue: 220 },
  { value: 'amber', label: 'Amber', hue: 40 },
]

export const PERSONALITY_OPTIONS: Option[] = [
  {
    value: 'sweet_girlfriend',
    label: 'Sweet',
    description: 'Warm, caring, deeply affectionate',
    hue: 340,
  },
  {
    value: 'shy_romantic',
    label: 'Shy',
    description: 'Gentle, soft-spoken, romantic',
    hue: 320,
  },
  {
    value: 'adventurous_spirit',
    label: 'Adventurous',
    description: 'Bold, spontaneous, fun',
    hue: 30,
  },
  {
    value: 'mysterious_one',
    label: 'Mysterious',
    description: 'Enigmatic, intriguing, deep',
    hue: 270,
  },
  {
    value: 'confident_leader',
    label: 'Confident',
    description: 'Assured, decisive, commanding',
    hue: 0,
  },
  {
    value: 'intellectual',
    label: 'Intellectual',
    description: 'Witty, thoughtful, curious',
    hue: 200,
  },
]

export const NAME_SUGGESTIONS = [
  'Aria',
  'Luna',
  'Mia',
  'Zoe',
  'Eva',
  'Hana',
  'Sofia',
  'Jade',
  'Isabella',
  'Diana',
]

export type OnboardingChoices = {
  style?: string
  body?: string
  hairColor?: string
  eyeColor?: string
  personality?: string
  name?: string
}

export const TOTAL_STEPS = 6
