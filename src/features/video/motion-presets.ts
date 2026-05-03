// Motion-strength presets for WAN 2.2 image-to-video. The user-facing slider
// in spec terms maps to:
//   subtle  ≈ 0.3-0.5 — breathing, slight head tilt, idle
//   medium  ≈ 0.6-0.8 — turns, gestures, expressions  ← MVP default
//   strong  ≈ 0.9+    — bigger movements, often artifacts (experimental)
//
// WAN 2.2 doesn't expose a single "motion strength" knob, so we steer it via:
//   - prompt suffix (motion-intensity language)
//   - guidance_scale (lower → more motion freedom)
//   - shift (higher → more identity preservation, less motion)
//   - num_frames (more frames → more time for motion to develop)

export type MotionStrength = 'subtle' | 'medium' | 'strong'

export type MotionPreset = {
  numFrames: number
  guidanceScale: number
  shift: number
  numInferenceSteps: number
  promptSuffix: string
}

export const MOTION_PRESETS: Record<MotionStrength, MotionPreset> = {
  subtle: {
    numFrames: 65,
    guidanceScale: 4.5,
    shift: 6,
    numInferenceSteps: 27,
    promptSuffix:
      'subtle gentle motion, soft natural breathing, slight head tilt, eyes blinking, minimal body movement, identity preserved',
  },
  medium: {
    numFrames: 81,
    guidanceScale: 3.5,
    shift: 5,
    numInferenceSteps: 27,
    promptSuffix:
      'natural fluid motion, gentle gestures, soft head turn, expressive eyes, subtle smile change, identity preserved',
  },
  strong: {
    numFrames: 97,
    guidanceScale: 2.5,
    shift: 4,
    numInferenceSteps: 30,
    promptSuffix:
      'expressive motion, dynamic gesture, body turning, hand movement, identity preserved',
  },
}

export type MotionMood = 'gentle' | 'playful' | 'intimate'

const MOOD_TAGS: Record<MotionMood, string> = {
  gentle: 'gentle calm mood, soft serene atmosphere',
  playful: 'playful upbeat mood, light flirty energy',
  intimate: 'intimate warm mood, close personal atmosphere, soft lighting',
}

// Assembles the WAN 2.2 prompt following the structure agreed with product:
//   [motion description], [subject preservation], [mood], [quality tags]
export function buildVideoPrompt(opts: {
  motionDescription: string
  mood: MotionMood
  motionStrength: MotionStrength
}): string {
  const preset = MOTION_PRESETS[opts.motionStrength]
  const motion = opts.motionDescription.trim() || 'soft natural movement'
  return [
    motion,
    'same person, same outfit, same setting, same hair color, same face, identity drift avoided',
    MOOD_TAGS[opts.mood],
    preset.promptSuffix,
    'smooth motion, natural movement, cinematic quality, high fidelity, stable camera',
  ].join(', ')
}

// Negative prompt — guard against scene change, identity drift, age-safety
// regressions, and common video artifacts.
export const VIDEO_NEGATIVE_PROMPT = [
  'deformed, multiple people, scene change, different person, different outfit, identity drift, blurry, distorted face, bad anatomy, extra limbs, watermark, text, logo, low quality, flickering, morphing, melting',
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), (petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), (childlike features:1.5)',
].join(', ')

export const MIN_SOURCE_RESOLUTION_PIXELS = 1024 * 1536
