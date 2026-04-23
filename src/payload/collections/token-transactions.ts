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
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Grant Subscription', value: 'grant_subscription' },
        { label: 'Grant Purchase', value: 'grant_purchase' },
        { label: 'Grant Bonus', value: 'grant_bonus' },
        { label: 'Spend Image', value: 'spend_image' },
        { label: 'Spend Image Premium', value: 'spend_image_premium' },
        { label: 'Spend Image Regen', value: 'spend_image_regen' },
        { label: 'Spend Video', value: 'spend_video' },
        { label: 'Spend Video Regen', value: 'spend_video_regen' },
        { label: 'Spend Advanced LLM', value: 'spend_advanced_llm' },
        { label: 'Refund', value: 'refund' },
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
