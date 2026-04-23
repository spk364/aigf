export type PlanKey = 'premium_monthly' | 'premium_yearly' | 'premium_plus_monthly'

export type PlanFeatures = {
  monthlyTokenAllocation: number
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
    priceCents: 9999,
    currency: 'USD',
    billingPeriod: 'yearly',
    ccbillFormName: 'PREMIUM_YEARLY_FORM',
    features: {
      monthlyTokenAllocation: 100,
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
    priceCents: 2999,
    currency: 'USD',
    billingPeriod: 'monthly',
    ccbillFormName: 'PREMIUM_PLUS_MONTHLY_FORM',
    features: {
      monthlyTokenAllocation: 300,
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
}

/** Resolve PlanKey from a CCBill webhook formName or subAccountNumber field. */
export function planFromCcbillForm(formName?: string | null): PlanKey | null {
  if (!formName) return null
  return CCBILL_FORM_TO_PLAN[formName] ?? null
}
