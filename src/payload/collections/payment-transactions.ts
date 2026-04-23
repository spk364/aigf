// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const PaymentTransactions: CollectionConfig = {
  slug: 'payment-transactions',
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
        { label: 'Subscription Initial', value: 'subscription_initial' },
        { label: 'Subscription Renewal', value: 'subscription_renewal' },
        { label: 'Token Purchase', value: 'token_purchase' },
        { label: 'Refund', value: 'refund' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Disputed', value: 'disputed' },
      ],
    },
    {
      name: 'amountCents',
      type: 'number',
      required: true,
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      options: [
        { label: 'CCBill', value: 'ccbill' },
        { label: 'Crypto BTC', value: 'crypto_btc' },
        { label: 'Crypto ETH', value: 'crypto_eth' },
        { label: 'Crypto USDT', value: 'crypto_usdt' },
      ],
    },
    {
      name: 'providerTransactionId',
      type: 'text',
      unique: true,
      index: true,
    },
    {
      name: 'providerRawData',
      type: 'json',
    },
    {
      name: 'subscriptionId',
      type: 'relationship',
      relationTo: 'subscriptions',
    },
    {
      name: 'tokenPackageId',
      type: 'relationship',
      relationTo: 'token-packages',
    },
    {
      name: 'cryptoAddress',
      type: 'text',
    },
    {
      name: 'cryptoAmountReceived',
      type: 'text',
    },
    {
      name: 'cryptoConfirmations',
      type: 'number',
    },
    {
      name: 'completedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
