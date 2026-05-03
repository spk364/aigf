// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const TokenTransactions: CollectionConfig = {
  slug: 'token-transactions',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'createdAt'] },
  ],
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      // Deterministic key derived from the originating event (e.g. `ccbill:newsale:{txId}`,
      // `image:{mediaAssetId}`, `safety_refund:{ledgerTxId}`). Lets retrying webhooks /
      // Inngest functions / fal.ai callbacks reach the ledger more than once without
      // double-crediting or double-charging. Nullable for legacy / admin entries —
      // Postgres treats NULLs as distinct so many null rows coexist under the unique index.
      name: 'idempotencyKey',
      type: 'text',
      unique: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Grant Subscription', value: 'grant_subscription' },
        { label: 'Grant Subscription Upfront', value: 'grant_subscription_upfront' },
        { label: 'Grant Purchase', value: 'grant_purchase' },
        { label: 'Grant Bonus', value: 'grant_bonus' },
        { label: 'Grant Promo', value: 'grant_promo' },
        { label: 'Grant Referral', value: 'grant_referral' },
        { label: 'Spend Image', value: 'spend_image' },
        { label: 'Spend Image Premium', value: 'spend_image_premium' },
        { label: 'Spend Image Regen', value: 'spend_image_regen' },
        { label: 'Spend Video', value: 'spend_video' },
        { label: 'Spend Video Regen', value: 'spend_video_regen' },
        { label: 'Spend Voice Message', value: 'spend_voice_message' },
        { label: 'Spend Voice Call', value: 'spend_voice_call' },
        { label: 'Spend Advanced LLM', value: 'spend_advanced_llm' },
        { label: 'Refund', value: 'refund' },
        { label: 'Safety Refund', value: 'safety_refund' },
        { label: 'Admin Adjustment', value: 'admin_adjustment' },
      ],
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
    },
    {
      name: 'balanceAfter',
      type: 'number',
      required: true,
    },
    {
      name: 'relatedMessageId',
      type: 'relationship',
      relationTo: 'messages',
    },
    {
      name: 'relatedPaymentId',
      type: 'relationship',
      relationTo: 'payment-transactions',
    },
    {
      name: 'adminUserId',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'reason',
      type: 'text',
    },
  ],
}
