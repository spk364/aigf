export type ImageModelStyle = 'realism' | 'anime' | 'mixed'

export type ImageModelOption = {
  id: string
  label: string
  // Short note shown under the selector in the admin UI: latency · cost · style.
  note: string
  // Pony/Illustrious SDXL checkpoints need score_9, score_8_up... prefix tokens.
  isPony?: boolean
  // FLUX models: no negative_prompt, natural language prompts work better than SD tokens.
  isFlux?: boolean
  // Loaded via fal-ai/lora — first call after a quiet period takes 2-3 minutes
  // for fal to fetch the HF checkpoint to a fresh GPU.
  isCold?: boolean
  // Category for grouping in the dropdown.
  style: ImageModelStyle
  // True when the model reliably renders consensual NSFW with the safety
  // checker disabled. False marks options where fal's hardcoded NSFW classifier
  // tends to return black frames even with `enable_safety_checker = false`.
  nsfwFriendly: boolean
}

// Order matters — index 0 is the default. We lead with FLUX Schnell because
// fal's hardcoded NSFW classifier on realistic-vision/fast-sdxl returns black
// frames on age + tattoo + piercing prompts even with enable_safety_checker
// off; FLUX endpoints don't go through that pipeline.
export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  // ── Native fal.ai endpoints — always warm ────────────────────────────────
  {
    id: 'fal-ai/flux/schnell',
    label: 'FLUX Schnell (recommended)',
    note: '~5–10 s · ~$0.003/img · realism + mixed · natural-language prompt · NSFW-friendly (fal classifier skipped)',
    isFlux: true,
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'fal-ai/flux/dev',
    label: 'FLUX Dev',
    note: '~30–60 s · ~$0.025/img · best FLUX quality · natural-language prompt · NSFW-friendly',
    isFlux: true,
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'fal-ai/realistic-vision',
    label: 'RealVisXL',
    note: '~20–50 s · ~$0.025/img · photorealistic · ⚠ fal NSFW filter often returns black frames',
    style: 'realism',
    nsfwFriendly: false,
  },
  {
    id: 'fal-ai/fast-sdxl',
    label: 'Fast SDXL',
    note: '~5–10 s · ~$0.005/img · generic SDXL · ⚠ same fal NSFW filter as RealVisXL',
    style: 'mixed',
    nsfwFriendly: false,
  },

  // ── Realistic NSFW (HF checkpoints via fal-ai/lora — 2-3 min cold start) ─
  // Pony/Illustrious checkpoints route through fal-ai/lora and bypass fal's
  // NSFW classifier — no black frames, just slow first call.
  {
    id: 'John6666/cyberrealistic-pony-v110-sdxl',
    label: 'CyberRealistic Pony v110',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · photorealistic · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/pony-realism-v22-main-sdxl',
    label: 'Pony Realism v22',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · photorealistic · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/duchaiten-pony-real-v60-sdxl',
    label: 'DuchaiTen Pony Real v60',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · photorealistic, softer skin · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },

  // ── Anime / Illustrious (HF checkpoints via fal-ai/lora — 2-3 min cold) ──
  {
    id: 'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl',
    label: 'WAI NSFW Illustrious v150',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · top anime · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'anime',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/hassaku-xl-illustrious-v31-sdxl',
    label: 'Hassaku XL Illustrious v31',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · stylized anime · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'anime',
    nsfwFriendly: true,
  },
]

export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODEL_OPTIONS[0]!.id

// Grouped view for the admin UI <optgroup> render.
export const IMAGE_MODEL_GROUPS: Array<{
  label: string
  style: ImageModelStyle | 'native'
}> = [
  { label: 'Native fal endpoints (warm)', style: 'native' },
  { label: 'Realism (cold start ~2–3 min)', style: 'realism' },
  { label: 'Anime / Illustrious (cold start ~2–3 min)', style: 'anime' },
]

// SDXL-native resolution buckets. We send these as explicit {width, height}
// to fal rather than the legacy preset enum, because fal's `portrait_4_3`
// (768×1024) and `portrait_16_9` (576×1024) sit below SDXL's training buckets
// and produce visibly worse character anatomy.
//
// `bestForVideo` flags sources that comfortably clear MIN_SOURCE_RESOLUTION_PIXELS
// (768×1024) in `motion-presets.ts` and animate well.
export type ImageSizePresetOption = {
  id: string
  label: string
  width: number
  height: number
  bestForVideo?: boolean
}

export const IMAGE_SIZE_PRESETS: ImageSizePresetOption[] = [
  {
    id: 'portrait_2_3',
    label: 'Portrait 2:3 — 832×1216',
    width: 832,
    height: 1216,
    bestForVideo: true,
  },
  {
    id: 'portrait_9_16',
    label: 'Portrait 9:16 — 768×1344 (best for video)',
    width: 768,
    height: 1344,
    bestForVideo: true,
  },
  {
    id: 'square_hd',
    label: 'Square HD — 1024×1024',
    width: 1024,
    height: 1024,
    bestForVideo: true,
  },
  {
    id: 'landscape_3_2',
    label: 'Landscape 3:2 — 1216×832',
    width: 1216,
    height: 832,
    bestForVideo: true,
  },
]

export const DEFAULT_IMAGE_SIZE_PRESET_ID = 'portrait_2_3'

export function resolveImageSize(
  presetId: string | undefined,
): { width: number; height: number } {
  const preset =
    IMAGE_SIZE_PRESETS.find((p) => p.id === presetId) ??
    IMAGE_SIZE_PRESETS.find((p) => p.id === DEFAULT_IMAGE_SIZE_PRESET_ID)!
  return { width: preset.width, height: preset.height }
}
