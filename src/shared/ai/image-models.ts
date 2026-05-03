export type ImageModelOption = {
  id: string
  label: string
  // Short note shown under the selector in the admin UI.
  note: string
  // Pony/Illustrious SDXL checkpoints need score_9, score_8_up... prefix tokens.
  isPony?: boolean
  // FLUX models: no negative_prompt, natural language prompts work better than SD tokens.
  isFlux?: boolean
}

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  // ── Native fal.ai endpoints — always warm ────────────────────────────────
  {
    id: 'fal-ai/realistic-vision',
    label: 'RealVisXL',
    note: '~20–50 s · photorealistic',
  },
  {
    id: 'fal-ai/fast-sdxl',
    label: 'Fast SDXL',
    note: '~5–10 s · generic SDXL',
  },
  {
    id: 'fal-ai/flux/schnell',
    label: 'FLUX Schnell',
    note: '~5–10 s · fastest FLUX · natural language',
    isFlux: true,
  },
  {
    id: 'fal-ai/flux/dev',
    label: 'FLUX Dev',
    note: '~30–60 s · best FLUX quality · natural language',
    isFlux: true,
  },
  // ── HuggingFace checkpoints via fal-ai/lora — 2-3 min cold start ─────────
  {
    id: 'John6666/cyberrealistic-pony-v110-sdxl',
    label: 'CyberRealistic Pony v110',
    note: 'SDXL Pony · ~2–3 min cold',
    isPony: true,
  },
  {
    id: 'John6666/pony-realism-v22-main-sdxl',
    label: 'Pony Realism v22',
    note: 'SDXL Pony · ~2–3 min cold',
    isPony: true,
  },
  {
    id: 'John6666/duchaiten-pony-real-v60-sdxl',
    label: 'DuchaiTen Pony Real v60',
    note: 'SDXL Pony · ~2–3 min cold',
    isPony: true,
  },
  {
    id: 'John6666/wai-nsfw-illustrious-sdxl-v80-sdxl',
    label: 'WAI NSFW Illustrious v80',
    note: 'Illustrious SDXL · ~2–3 min cold',
    isPony: true,
  },
]

export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODEL_OPTIONS[0]!.id

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
