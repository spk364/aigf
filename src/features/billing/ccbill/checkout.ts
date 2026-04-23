import type { PlanKey } from '../plans'
import { PLANS } from '../plans'

type BuildCheckoutUrlOpts = {
  userId: string | number
  plan: PlanKey
  locale: string
}

/**
 * Build a CCBill FlexForm checkout URL.
 *
 * If CCBILL_ACCOUNT_NUM is not configured (local dev / CI), returns a
 * placeholder path so the /upgrade page can still render without crashing.
 *
 * TODO(phase-2-ccbill-config): Replace FORM_ID placeholder with the real
 * CCBill FlexForm ID once merchant account forms are configured.
 */
export function buildCheckoutUrl({ userId, plan, locale }: BuildCheckoutUrlOpts): string {
  const accountNum = process.env.CCBILL_ACCOUNT_NUM
  const subAccountNum = process.env.CCBILL_SUBACCOUNT_NUM
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!accountNum) {
    console.warn(
      '[billing] CCBILL_ACCOUNT_NUM is not set — returning mock checkout URL. Set env vars for real CCBill integration.',
    )
    return `/billing/mock-checkout?plan=${plan}`
  }

  const planConfig = PLANS[plan]
  const formId = planConfig.ccbillFormName

  const returnUrl = `${appUrl}/${locale}/billing/return`

  const params = new URLSearchParams({
    clientAccnum: accountNum,
    clientSubacc: subAccountNum ?? '0000',
    customerId: String(userId),
    formName: formId,
    returnUrl,
  })

  // CCBill FlexForm sandbox base URL
  return `https://api.ccbill.com/wap-frontflex/flexforms/${encodeURIComponent(formId)}?${params.toString()}`
}
