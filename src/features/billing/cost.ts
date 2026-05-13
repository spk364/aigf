// Single source of truth for per-action token costs and daily caps.
//
// Each constant pairs a user-visible action with its token debit. The numbers
// are calibrated against external $-cost (fal.ai, OpenRouter) so that the
// cheapest pack still has positive margin in the worst-case spend pattern;
// see docs/payments-tokenomics-plan.md §2.6 for the derivation.

import type { PlanKey } from './plans'

// Chat-image on the default fast endpoint (FLUX schnell, ~$0.003/image).
// Cheap enough to make a fully-spent tokens_3000 pack still profitable.
export const IMAGE_FAST_COST = 1

// Chat-image on a standard SDXL endpoint (RealVisXL / fast-sdxl, ~$0.04–0.05).
// Reserved for an explicit "boost quality" toggle in chat.
export const IMAGE_STANDARD_COST = 2

// Chat-image on a premium LoRA endpoint (Pony / Illustrious via fal-ai/lora,
// ~$0.08–0.10). User-selectable from the builder; not yet a chat option.
export const IMAGE_PREMIUM_COST = 5

// TTS via fal.ai MiniMax. ~$0.05 per typical chat-length playback (up to
// 1500 chars). Cached per message — only the first ▶ click charges.
export const TTS_TOKEN_COST = 2

// Image-to-video via fal.ai WAN. ~$0.30–0.50 per 5s clip. Margin is tight
// even at this price, so video is positioned as a Premium+ feature.
export const VIDEO_TOKEN_COST = 20

// Premium LLM (Magnum v4 round, ~$0.005 per response). Charged separately
// from chat history because it's an upgrade users can opt into.
export const ADVANCED_LLM_COST = 2

// Per-day TTS playback ceiling. Token spend alone doesn't bound abuse — a user
// who buys tokens_3000 could in theory burn 1500 fal.ai TTS calls in a day.
// Cap = soft ceiling: above it, return 429 with retry-after midnight UTC.
// Free has cap 0 because TTS is premium-only (route returns 402 first).
export const TTS_DAILY_CAP_BY_PLAN: Record<PlanKey | 'free', number> = {
  free: 0,
  premium_monthly: 50,
  premium_yearly: 50,
  premium_plus_monthly: 200,
  premium_plus_yearly: 200,
}
