// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const Subscriptions: CollectionConfig = {
  slug: 'subscriptions',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'plan',
      type: 'select',
      required: true,
      options: [
        { label: 'Free', value: 'free' },
        { label: 'Premium Monthly', value: 'premium_monthly' },
        { label: 'Premium Yearly', value: 'premium_yearly' },
        { label: 'Premium Plus Monthly', value: 'premium_plus_monthly' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Past Due', value: 'past_due' },
        { label: 'Canceled', value: 'canceled' },
        { label: 'Expired', value: 'expired' },
        { label: 'Trialing', value: 'trialing' },
      ],
    },
    {
      name: 'currentPeriodStart',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'currentPeriodEnd',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'cancelAtPeriodEnd',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'canceledAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'provider',
      type: 'select',
      options: [
        { label: 'CCBill', value: 'ccbill' },
        { label: 'Crypto', value: 'crypto' },
        { label: 'Manual', value: 'manual' },
      ],
    },
    {
      name: 'providerSubscriptionId',
      type: 'text',
      index: true,
    },
    {
      name: 'amountCents',
      type: 'number',
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
    {
      name: 'features',
      type: 'json',
    },
    {
      name: 'lastTokenGrantDate',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
