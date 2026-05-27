import type { PlanKey } from '@/features/billing/plans'
import { PLANS } from '@/features/billing/plans'

/**
 * Live "exit intent" promo — surfaced when a user dismisses the paywall on
 * /upgrade, the inline chat paywall, or runs into a quota wall. Single
 * source of truth so the discount badge, CTA URL, and analytics tag stay
 * in sync across the two modals.
 *
 * Defaults to 50% off the cheapest monthly plan for the first billing cycle:
 * the smallest commitment we can hand a wavering free-tier user. The
 * `code` is purely a UI marker for now — CCBill coupon redemption is a
 * follow-up phase. Carrying it on the URL means analytics can attribute
 * checkouts that came through the exit-intent funnel without changing the
 * checkout flow itself.
 */
export type ExitIntentPromo = {
  code: string
  percentOff: number
  planKey: PlanKey
  originalPriceCents: number
  discountedPriceCents: number
  /** Hours from first impression; the client uses this for the countdown. */
  expiresInHours: number
}

export type ExitIntentPromoOverride = {
  percentOff?: number
  planKey?: PlanKey
  code?: string
  expiresInHours?: number
}

/**
 * Resolve the live exit-intent promo, optionally letting an admin override
 * one or more fields via the `paywall-blocks` CMS row for the `exit_intent`
 * surface. Anything not set in the override falls back to the bundled
 * default (50% off monthly Premium for 24h).
 */
export function getActiveExitIntentPromo(
  override?: ExitIntentPromoOverride,
): ExitIntentPromo {
  const planKey: PlanKey = override?.planKey ?? 'premium_monthly'
  const plan = PLANS[planKey]
  // Clamp to keep the strikethrough sensible — a 100% "free month" can't
  // be honoured by CCBill yet and a negative would render garbage.
  const percentOff = clampPercent(override?.percentOff ?? 50)
  return {
    code: override?.code?.trim() || 'STEAMY50',
    percentOff,
    planKey,
    originalPriceCents: plan.priceCents,
    discountedPriceCents: Math.round(plan.priceCents * (1 - percentOff / 100)),
    expiresInHours: Math.max(1, Math.min(72, Math.round(override?.expiresInHours ?? 24))),
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(95, Math.round(value)))
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
