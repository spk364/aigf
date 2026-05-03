/**
 * Token-pack one-time purchase URL builder.
 *
 * Production path: builds a CCBill FlexForm URL for a single-charge form
 * configured per SKU. When CCBILL_ACCOUNT_NUM is unset (local dev / CI / before
 * merchant approval) we hand back a mock-checkout path that the corresponding
 * server action will resolve as a stub purchase — see purchaseTokenPackAction.
 */

type BuildOpts = {
  userId: string | number
  sku: string
  locale: string
}

// SKU → CCBill FlexForm name. One form per pack so analytics / pricing can be
// adjusted in CCBill admin without code changes.
// TODO(phase-2-ccbill-config): replace with real form ids after merchant
// approval. Until then the env-unset branch below short-circuits to mock.
const CCBILL_FORM_BY_SKU: Record<string, string> = {
  tokens_100: 'TOKENS_100_FORM',
  tokens_300: 'TOKENS_300_FORM',
  tokens_1000: 'TOKENS_1000_FORM',
  tokens_3000: 'TOKENS_3000_FORM',
}

export function buildTokenPackCheckoutUrl({ userId, sku, locale }: BuildOpts): string {
  const accountNum = process.env.CCBILL_ACCOUNT_NUM
  const subAccountNum = process.env.CCBILL_SUBACCOUNT_NUM
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (!accountNum) {
    return `/${locale}/billing/mock-token-pack?sku=${encodeURIComponent(sku)}`
  }

  const formId = CCBILL_FORM_BY_SKU[sku]
  if (!formId) {
    throw new Error(`buildTokenPackCheckoutUrl: unknown sku "${sku}"`)
  }

  const returnUrl = `${appUrl}/${locale}/billing/return?type=token_pack`

  const params = new URLSearchParams({
    clientAccnum: accountNum,
    clientSubacc: subAccountNum ?? '0000',
    customerId: String(userId),
    formName: formId,
    returnUrl,
    metadata: JSON.stringify({ sku, kind: 'token_pack' }),
  })

  return `https://api.ccbill.com/wap-frontflex/flexforms/${encodeURIComponent(formId)}?${params.toString()}`
}

export function isTokenPackBillingMocked(): boolean {
  return !process.env.CCBILL_ACCOUNT_NUM
}
