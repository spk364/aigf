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
