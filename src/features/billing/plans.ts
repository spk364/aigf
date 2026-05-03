export type PlanKey =
  | 'premium_monthly'
  | 'premium_yearly'
  | 'premium_plus_monthly'
  | 'premium_plus_yearly'

export type PlanFeatures = {
  monthlyTokenAllocation: number
  /**
   * Bonus tokens granted once on the very first billing cycle of an annual plan.
   * Yearly subs effectively front-load value to lift conversion vs. monthly.
   * Monthly plans set this to 0.
   */
  annualUpfrontBonus: number
  llmTier: 'standard' | 'premium' | 'premium_plus'
  videoEnabled: boolean
  monthlyVideoQuota: number
  priorityQueue: boolean
  customCharacterLimit: number // -1 = unlimited
}

export type Plan = {
  key: PlanKey
  displayKey: string
  priceCents: number
  currency: 'USD'
  billingPeriod: 'monthly' | 'yearly'
  ccbillFormName: string
  features: PlanFeatures
}

export const PLANS: Record<PlanKey, Plan> = {
  premium_monthly: {
    key: 'premium_monthly',
    displayKey: 'billing.plans.premium_monthly',
    priceCents: 1299,
    currency: 'USD',
    billingPeriod: 'monthly',
    ccbillFormName: 'PREMIUM_MONTHLY_FORM',
    features: {
      monthlyTokenAllocation: 100,
      annualUpfrontBonus: 0,
      llmTier: 'standard',
      videoEnabled: false,
      monthlyVideoQuota: 0,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  },
  premium_yearly: {
    key: 'premium_yearly',
    displayKey: 'billing.plans.premium_yearly',
    priceCents: 8388, // $69.88 — ~46% off the equivalent monthly price ($155.88)
    currency: 'USD',
    billingPeriod: 'yearly',
    ccbillFormName: 'PREMIUM_YEARLY_FORM',
    features: {
      monthlyTokenAllocation: 100,
      annualUpfrontBonus: 200,
      llmTier: 'standard',
      videoEnabled: false,
      monthlyVideoQuota: 0,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  },
  premium_plus_monthly: {
    key: 'premium_plus_monthly',
    displayKey: 'billing.plans.premium_plus_monthly',
    priceCents: 2499,
    currency: 'USD',
    billingPeriod: 'monthly',
    ccbillFormName: 'PREMIUM_PLUS_MONTHLY_FORM',
    features: {
      monthlyTokenAllocation: 300,
      annualUpfrontBonus: 0,
      llmTier: 'premium_plus',
      videoEnabled: true,
      monthlyVideoQuota: 5,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  },
  premium_plus_yearly: {
    key: 'premium_plus_yearly',
    displayKey: 'billing.plans.premium_plus_yearly',
    priceCents: 17988, // $179.88 — ~40% off equivalent monthly ($299.88)
    currency: 'USD',
    billingPeriod: 'yearly',
    ccbillFormName: 'PREMIUM_PLUS_YEARLY_FORM',
    features: {
      monthlyTokenAllocation: 300,
      annualUpfrontBonus: 500,
      llmTier: 'premium_plus',
      videoEnabled: true,
      monthlyVideoQuota: 5,
      priorityQueue: true,
      customCharacterLimit: -1,
    },
  },
}

/**
 * Map CCBill form names / subaccount identifiers back to a PlanKey.
 * Real mapping is populated once merchant account forms are configured.
 * TODO(phase-2-ccbill-config): Replace placeholder strings with real CCBill form IDs.
 */
export const CCBILL_FORM_TO_PLAN: Record<string, PlanKey> = {
  PREMIUM_MONTHLY_FORM: 'premium_monthly',
  PREMIUM_YEARLY_FORM: 'premium_yearly',
  PREMIUM_PLUS_MONTHLY_FORM: 'premium_plus_monthly',
  PREMIUM_PLUS_YEARLY_FORM: 'premium_plus_yearly',
}

/** Resolve PlanKey from a CCBill webhook formName or subAccountNumber field. */
export function planFromCcbillForm(formName?: string | null): PlanKey | null {
  if (!formName) return null
  return CCBILL_FORM_TO_PLAN[formName] ?? null
}

/**
 * True for any paid plan. Centralised so adding a new SKU (e.g. premium_plus_yearly)
 * doesn't silently skip the upgrade gate in dashboard/chat/quota.
 */
export function isPremiumPlan(plan: string | null | undefined): boolean {
  if (!plan) return false
  return plan in PLANS
}
