// Image-model catalogue. Both providers are accessible via this list — the
// route layer dispatches on `provider`. fal stays as the primary path for
// realistic photo + anime checkpoints (no prompt classifier on image flows
// despite the WAN-video filter); Atlas adds WAN 2.6 t2i and image-edit as
// alternatives that share a single provider with our video pipeline.
//
// Endpoint slugs are duplicated as literals (rather than imported from
// adapter modules) because both `./fal` and `./atlas` are `server-only`,
// and this module is pulled into the admin client bundle through
// GenerateImageButton. Keep these in sync with FAL_ENDPOINT_* in `./fal`.

export type ImageModelStyle = 'realism' | 'anime' | 'mixed'
export type ImageProvider = 'fal' | 'atlas'

export type ImageModelOption = {
  // Stable identifier sent over the wire. Equal to either:
  //   - fal native endpoint slug (`fal-ai/flux/schnell`)
  //   - HF repo id for fal-ai/lora checkpoints (`John6666/cyberrealistic-...`)
  //   - Atlas model slug (`alibaba/wan-2.6/text-to-image`)
  // Use detectImageProvider to recover provider from a bare id when the
  // option lookup misses (legacy DB values, admin-typed override).
  id: string
  provider: ImageProvider
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
  // True when the model reliably renders consensual NSFW. False marks options
  // where fal's hardcoded NSFW classifier tends to return black frames even
  // with `enable_safety_checker = false`.
  nsfwFriendly: boolean
}

// Order matters — index 0 is the default. Atlas WAN 2.6 t2i leads to keep
// the same provider for image and video flows. FLUX Schnell stays as the
// "always-warm fal fallback" — switch to it when Atlas is rate-limited or
// when a flow specifically needs FLUX's natural-language prompt handling.
export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  // ── Atlas Cloud — primary NSFW-strong, single-provider with video ────────
  {
    id: 'alibaba/wan-2.6/text-to-image',
    provider: 'atlas',
    label: '[Atlas] WAN 2.6 text-to-image (recommended)',
    note: '~10–30 s · $0.021/img · realism + mixed · NSFW-strong, no prompt filter',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'alibaba/wan-2.6/image-edit',
    provider: 'atlas',
    label: '[Atlas] WAN 2.6 image-edit (requires source img)',
    note: '~10–30 s · $0.021/img · ⚠ requires existing reference or primary image · NSFW-strong',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'alibaba/wan-2.5/image-edit',
    provider: 'atlas',
    label: '[Atlas] WAN 2.5 image-edit (requires source img)',
    note: '~10–30 s · $0.021/img · ⚠ requires existing reference or primary image · NSFW-strong',
    style: 'mixed',
    nsfwFriendly: true,
  },

  // ── fal.ai — native warm endpoints ──────────────────────────────────────
  {
    id: 'fal-ai/flux/schnell',
    provider: 'fal',
    label: '[fal] FLUX Schnell',
    note: '~5–10 s · ~$0.003/img · realism + mixed · natural-language prompt · NSFW-friendly',
    isFlux: true,
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'fal-ai/flux/dev',
    provider: 'fal',
    label: '[fal] FLUX Dev',
    note: '~30–60 s · ~$0.025/img · best FLUX quality · natural-language · NSFW-friendly',
    isFlux: true,
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'fal-ai/realistic-vision',
    provider: 'fal',
    label: '[fal] RealVisXL',
    note: '~20–50 s · ~$0.025/img · photorealistic · ⚠ fal NSFW filter often returns black frames',
    style: 'realism',
    nsfwFriendly: false,
  },
  {
    id: 'fal-ai/fast-sdxl',
    provider: 'fal',
    label: '[fal] Fast SDXL',
    note: '~5–10 s · ~$0.005/img · generic SDXL · ⚠ same fal NSFW filter as RealVisXL',
    style: 'mixed',
    nsfwFriendly: false,
  },

  // ── fal.ai — Realistic NSFW LoRA checkpoints (2-3 min cold start) ───────
  // The id IS the HF repo slug — the route detects "non-fal-ai/, non-Atlas"
  // ids and routes through fal-ai/lora with model_name set to the id.
  {
    id: 'John6666/cyberrealistic-pony-v110-sdxl',
    provider: 'fal',
    label: '[fal LoRA] CyberRealistic Pony v110',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · photorealistic · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/pony-realism-v22-main-sdxl',
    provider: 'fal',
    label: '[fal LoRA] Pony Realism v22',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · photorealistic · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/duchaiten-pony-real-v60-sdxl',
    provider: 'fal',
    label: '[fal LoRA] DuchaiTen Pony Real v60',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · softer skin · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'realism',
    nsfwFriendly: true,
  },

  // ── fal.ai — Anime / Illustrious LoRA checkpoints (cold) ────────────────
  {
    id: 'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl',
    provider: 'fal',
    label: '[fal LoRA] WAI NSFW Illustrious v150',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · top anime · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'anime',
    nsfwFriendly: true,
  },
  {
    id: 'John6666/hassaku-xl-illustrious-v31-sdxl',
    provider: 'fal',
    label: '[fal LoRA] Hassaku XL Illustrious v31',
    note: '~30–60 s warm · ~2–3 min cold · ~$0.05/img · stylized anime · NSFW-strong',
    isPony: true,
    isCold: true,
    style: 'anime',
    nsfwFriendly: true,
  },
]

export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODEL_OPTIONS[0]!.id

export function findImageModel(id: string): ImageModelOption | undefined {
  return IMAGE_MODEL_OPTIONS.find((m) => m.id === id)
}

export function isAllowedImageModelId(id: string): boolean {
  return IMAGE_MODEL_OPTIONS.some((m) => m.id === id)
}

// Falls back to prefix detection when an id is unknown (legacy DB values,
// admin-typed override). Atlas slugs always start with one of these vendor
// prefixes; fal-ai/* is fal native; anything else (e.g. John6666/...) is
// a HuggingFace repo routed via fal-ai/lora.
export function detectImageProvider(id: string): ImageProvider {
  if (
    id.startsWith('atlascloud/') ||
    id.startsWith('alibaba/') ||
    id.startsWith('bytedance/')
  ) {
    return 'atlas'
  }
  return 'fal'
}

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
