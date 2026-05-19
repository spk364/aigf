// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

/**
 * Editable paywall blocks (exit-intent modal + in-chat paywall variants).
 * One active row per `surface` value at any given time; the front-end picks
 * the most recently updated active row. If no row exists, the app falls back
 * to the bundled i18n strings — so the collection is purely additive.
 */
export const PaywallBlocks: CollectionConfig = {
  slug: 'paywall-blocks',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  admin: {
    useAsTitle: 'internalName',
    defaultColumns: ['internalName', 'surface', 'isActive', 'updatedAt'],
    description:
      'Editable paywall blocks (exit-intent modal + in-chat paywall). If no active row exists for a surface, the app falls back to the bundled defaults.',
  },
  indexes: [{ fields: ['surface', 'isActive'] }],
  fields: [
    {
      name: 'internalName',
      type: 'text',
      required: true,
      admin: { description: 'Admin-only label so editors can identify this block in the list view.' },
    },
    {
      name: 'surface',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Exit-intent modal (when user leaves /upgrade)', value: 'exit_intent' },
        { label: 'In-chat paywall — daily message limit', value: 'chat_paywall_quota' },
        { label: 'In-chat paywall — out of tokens', value: 'chat_paywall_tokens' },
        { label: 'In-chat paywall — premium-only feature', value: 'chat_paywall_premium' },
      ],
      admin: { description: 'Which paywall surface this row controls.' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },

    // ── Visuals ────────────────────────────────────────────────────────────
    {
      name: 'image',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        description:
          'Hero image. When set, replaces the auto-picked featured-character strip. Leave empty to fall back to the strip of 3 featured characters.',
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      admin: {
        description:
          'Optional direct image URL. Takes precedence over the relationship above — handy for quick CMS edits without uploading.',
      },
    },

    // ── Copy ───────────────────────────────────────────────────────────────
    {
      name: 'badge',
      type: 'text',
      localized: true,
      admin: { description: 'Small pill above the headline (e.g. "Limited offer", "Wait!").' },
    },
    {
      name: 'headline',
      type: 'text',
      localized: true,
    },
    {
      name: 'subheadline',
      type: 'textarea',
      localized: true,
      admin: {
        description:
          "Subheadline shown under the title. In chat-paywall surfaces you can use the {name} token — it's replaced with the current character's name.",
      },
    },
    {
      name: 'perks',
      type: 'array',
      localized: true,
      admin: {
        description: 'Bullet perks. Shown in the in-chat paywall; ignored in the exit-intent modal.',
      },
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'primaryCta',
      type: 'text',
      localized: true,
      admin: { description: 'Main CTA button label.' },
    },
    {
      name: 'secondaryCta',
      type: 'text',
      localized: true,
      admin: { description: 'Secondary CTA (e.g. "Or buy tokens à la carte"). Optional.' },
    },
    {
      name: 'declineCta',
      type: 'text',
      localized: true,
      admin: { description: '"No thanks" / dismiss link copy.' },
    },

    // ── Promo (exit-intent only) ───────────────────────────────────────────
    {
      name: 'discountPercent',
      type: 'number',
      min: 0,
      max: 95,
      admin: {
        description:
          'Exit-intent only. Discount applied to the chosen plan for the first billing period. Leave empty to use the default (50%).',
      },
    },
    {
      name: 'discountPlanKey',
      type: 'select',
      options: [
        { label: 'Premium — monthly', value: 'premium_monthly' },
        { label: 'Premium — yearly', value: 'premium_yearly' },
        { label: 'Premium Plus — monthly', value: 'premium_plus_monthly' },
        { label: 'Premium Plus — yearly', value: 'premium_plus_yearly' },
      ],
      admin: {
        description: 'Exit-intent only. Which plan the discount is anchored to. Defaults to monthly Premium.',
      },
    },
    {
      name: 'promoCode',
      type: 'text',
      admin: {
        description:
          'Exit-intent only. Used as the ?promo=... URL marker for downstream analytics / CCBill coupon mapping.',
      },
    },
    {
      name: 'expiresInHours',
      type: 'number',
      defaultValue: 24,
      admin: {
        description: 'Exit-intent only. Countdown duration (in hours) measured from the first impression in the user\'s browser.',
      },
    },

    // ── Misc ───────────────────────────────────────────────────────────────
    {
      name: 'pricePerPeriodLabel',
      type: 'text',
      localized: true,
      admin: {
        description: "Exit-intent only. Trailing label after the price (e.g. \"/ first month\").",
      },
    },
    {
      name: 'expiresInLabel',
      type: 'text',
      localized: true,
      admin: { description: "Exit-intent only. Prefix for the countdown (e.g. \"Offer expires in\")." },
    },
  ],
}
