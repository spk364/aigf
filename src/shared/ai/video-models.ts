import {
  FAL_ENDPOINT_WAN_V22_I2V,
  FAL_ENDPOINT_WAN_V22_I2V_TURBO,
  FAL_ENDPOINT_WAN_V22_5B_I2V,
} from './fal'

export type VideoModelStyle = 'realism' | 'anime' | 'mixed'

export type VideoModelOption = {
  id: string
  label: string
  // Short note shown under the selector in the admin UI: latency · cost · style.
  note: string
  // 'per-video' = fixed price regardless of length (Turbo).
  // 'per-second' = billed by output duration (base + 5B).
  pricingMode: 'per-video' | 'per-second'
  style: VideoModelStyle
  // NSFW-friendly = open-weight WAN family, safety_checker disabled at submit.
  // Marked false for any future Partner/Alibaba endpoints we might expose.
  nsfwFriendly: boolean
}

// Order matters — index 0 is the default. Turbo leads because it's the best
// price/latency for typical 5-second clips and uses the same uncensored WAN
// 2.2 14B weights as the premium variant.
export const VIDEO_MODEL_OPTIONS: VideoModelOption[] = [
  {
    id: FAL_ENDPOINT_WAN_V22_I2V_TURBO,
    label: 'WAN 2.2 14B Turbo (recommended)',
    note: '~30–60 s · $0.05/$0.075/$0.10 fixed per video (480/580/720p) · realism + anime · NSFW-friendly',
    pricingMode: 'per-video',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: FAL_ENDPOINT_WAN_V22_I2V,
    label: 'WAN 2.2 14B (premium quality)',
    note: '~3–6 min/720p · $0.04/$0.06/$0.08 per second · best fidelity · NSFW-friendly',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: FAL_ENDPOINT_WAN_V22_5B_I2V,
    label: 'WAN 2.2 5B (budget / preview)',
    note: 'faster, cheaper · weaker identity preservation · NSFW-friendly · good for previews / free-tier',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: true,
  },
]

export const DEFAULT_VIDEO_MODEL_ID = VIDEO_MODEL_OPTIONS[0]!.id

// Allowlist — used by the API route to reject arbitrary endpoint values.
export function isAllowedVideoEndpoint(id: string): boolean {
  return VIDEO_MODEL_OPTIONS.some((m) => m.id === id)
}
