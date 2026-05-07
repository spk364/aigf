// Endpoint slugs are duplicated as literals here (rather than imported from
// `./fal` or `./atlas`) because both adapter files are `server-only` and this
// module gets pulled into the admin client bundle through GenerateVideoButton.
// Keep these in sync with the corresponding constants in `./fal` (FAL_ENDPOINT_*).

export type VideoModelStyle = 'realism' | 'anime' | 'mixed'
export type VideoProvider = 'fal' | 'atlas'

export type VideoModelOption = {
  // Stable identifier sent over the wire — equal to the provider-specific
  // endpoint slug. fal endpoints start with `fal-ai/`, Atlas endpoints start
  // with one of `atlascloud/`, `alibaba/`, `bytedance/`. Use detectVideoProvider
  // to recover the provider from a bare id when the option lookup misses.
  id: string
  provider: VideoProvider
  label: string
  // Short note shown under the selector in the admin UI: latency · cost · style.
  note: string
  // 'per-video' = fixed price regardless of length (Turbo variants).
  // 'per-second' = billed by output duration (full base / spicy variants).
  pricingMode: 'per-video' | 'per-second'
  style: VideoModelStyle
  // True when the model reliably renders consensual NSFW. False for any
  // future Partner / mainstream endpoints we might expose with strict
  // server-side filtering.
  nsfwFriendly: boolean
}

// Order matters — index 0 is the default. Atlas Turbo Spicy leads because:
//   1. No platform-level prompt classifier (fal blocks explicit terms).
//   2. Cheapest of the lot ($0.02 fixed per video).
//   3. ~30-60 s latency, on par with fal Turbo.
export const VIDEO_MODEL_OPTIONS: VideoModelOption[] = [
  // ── Atlas Cloud — primary NSFW path ──────────────────────────────────────
  {
    id: 'atlascloud/wan-2.2-turbo-spicy/image-to-video',
    provider: 'atlas',
    label: '[Atlas] WAN 2.2 Turbo Spicy (recommended)',
    note: '~30–60 s · $0.02 fixed per video · NSFW-strong, no prompt filter · realism + anime',
    pricingMode: 'per-video',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'alibaba/wan-2.2-spicy/image-to-video',
    provider: 'atlas',
    label: '[Atlas] WAN 2.2 Spicy (premium quality)',
    note: '~60–120 s · $0.03/sec · best 14B fidelity, NSFW-strong',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'alibaba/wan-2.2-spicy/image-to-video-lora',
    provider: 'atlas',
    label: '[Atlas] WAN 2.2 Spicy LoRA',
    note: '~60–120 s · $0.04/sec · WAN 2.2 + style LoRA injection · NSFW-strong',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: true,
  },
  {
    id: 'bytedance/seedance-v1.5-pro/image-to-video-spicy',
    provider: 'atlas',
    label: '[Atlas] Seedance v1.5 Pro Spicy (top-tier)',
    note: '~60–90 s · $0.049/sec · ByteDance premium quality · NSFW-strong',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: true,
  },

  // ── fal.ai — kept for SFW/diagnostic use; ⚠ prompt classifier on WAN ────
  {
    id: 'fal-ai/wan/v2.2-a14b/image-to-video/turbo',
    provider: 'fal',
    label: '[fal] WAN 2.2 14B Turbo (⚠ prompt filter)',
    note: '~30–60 s · $0.05/$0.075/$0.10 fixed (480/580/720p) · ⚠ fal classifier blocks explicit terms',
    pricingMode: 'per-video',
    style: 'mixed',
    nsfwFriendly: false,
  },
  {
    id: 'fal-ai/wan/v2.2-a14b/image-to-video',
    provider: 'fal',
    label: '[fal] WAN 2.2 14B (⚠ prompt filter, premium)',
    note: '~3–6 min/720p · $0.04/$0.06/$0.08 per second · ⚠ same fal classifier',
    pricingMode: 'per-second',
    style: 'mixed',
    nsfwFriendly: false,
  },
]

export const DEFAULT_VIDEO_MODEL_ID = VIDEO_MODEL_OPTIONS[0]!.id

export function findVideoModel(id: string): VideoModelOption | undefined {
  return VIDEO_MODEL_OPTIONS.find((m) => m.id === id)
}

export function isAllowedVideoModelId(id: string): boolean {
  return VIDEO_MODEL_OPTIONS.some((m) => m.id === id)
}

// Falls back to prefix detection when an id is unknown (legacy DB values,
// admin-typed override, etc.). Atlas slugs always start with one of these
// vendor prefixes; everything else is fal (native or LoRA via HF).
export function detectVideoProvider(id: string): VideoProvider {
  if (
    id.startsWith('atlascloud/') ||
    id.startsWith('alibaba/') ||
    id.startsWith('bytedance/')
  ) {
    return 'atlas'
  }
  return 'fal'
}
