import 'server-only'
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { PlanKey } from '@/features/billing/plans'

export type PaywallSurface =
  | 'exit_intent'
  | 'chat_paywall_quota'
  | 'chat_paywall_tokens'
  | 'chat_paywall_premium'

/**
 * Shape returned by `getPaywallBlock`. Every field is optional so callers can
 * spread it over the i18n defaults and let `??` pick whichever side has a
 * non-empty value. Returning `null` when no admin row exists is the explicit
 * "use defaults" signal.
 */
export type PaywallBlock = {
  imageUrl?: string
  badge?: string
  headline?: string
  subheadline?: string
  perks?: string[]
  primaryCta?: string
  secondaryCta?: string
  declineCta?: string
  discountPercent?: number
  discountPlanKey?: PlanKey
  promoCode?: string
  expiresInHours?: number
  pricePerPeriodLabel?: string
  expiresInLabel?: string
}

type LocaleCode = 'en' | 'ru' | 'es'
const SUPPORTED_LOCALES: LocaleCode[] = ['en', 'ru', 'es']

function isSupportedLocale(value: string): value is LocaleCode {
  return (SUPPORTED_LOCALES as string[]).includes(value)
}

/**
 * Load the active CMS-managed block for a paywall surface, in the user's
 * locale. Returns `null` when:
 *   - the `paywall-blocks` table doesn't exist yet (fresh deploy before
 *     `PAYLOAD_PUSH_DB=true` runs),
 *   - no row is active for the surface,
 *   - any read error (logged but non-fatal).
 *
 * The caller is expected to merge non-empty fields over the bundled i18n
 * defaults; missing fields silently fall through.
 */
export const getPaywallBlock = cache(
  async (surface: PaywallSurface, locale: string): Promise<PaywallBlock | null> => {
    try {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'paywall-blocks',
        where: {
          and: [
            { surface: { equals: surface } },
            { isActive: { equals: true } },
          ],
        },
        limit: 1,
        sort: '-updatedAt',
        depth: 1,
        locale: isSupportedLocale(locale) ? locale : 'en',
        overrideAccess: true,
      })
      const doc = res.docs[0]
      if (!doc) return null

      const imageRel = doc.image as Record<string, unknown> | null | undefined
      const fromRel =
        imageRel && typeof imageRel === 'object' && typeof imageRel.publicUrl === 'string'
          ? (imageRel.publicUrl as string)
          : undefined
      const imageUrl = (doc.imageUrl as string | undefined) || fromRel

      const perksRaw = Array.isArray(doc.perks) ? (doc.perks as { text?: string }[]) : []
      const perks = perksRaw.map((p) => p?.text ?? '').filter((s) => s.length > 0)

      return {
        imageUrl: imageUrl || undefined,
        badge: nullToUndef(doc.badge),
        headline: nullToUndef(doc.headline),
        subheadline: nullToUndef(doc.subheadline),
        perks: perks.length > 0 ? perks : undefined,
        primaryCta: nullToUndef(doc.primaryCta),
        secondaryCta: nullToUndef(doc.secondaryCta),
        declineCta: nullToUndef(doc.declineCta),
        discountPercent:
          typeof doc.discountPercent === 'number' ? doc.discountPercent : undefined,
        discountPlanKey: nullToUndef(doc.discountPlanKey) as PlanKey | undefined,
        promoCode: nullToUndef(doc.promoCode),
        expiresInHours:
          typeof doc.expiresInHours === 'number' ? doc.expiresInHours : undefined,
        pricePerPeriodLabel: nullToUndef(doc.pricePerPeriodLabel),
        expiresInLabel: nullToUndef(doc.expiresInLabel),
      }
    } catch (err) {
      // Don't crash a paywall just because admin-config is unreachable.
      // The most common cause is "table doesn't exist yet" right after the
      // schema is added but before the next `PAYLOAD_PUSH_DB=true` boot.
      console.warn('[paywall] getPaywallBlock failed for', surface, err)
      return null
    }
  },
)

function nullToUndef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
