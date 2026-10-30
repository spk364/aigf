import type { CollectionConfig } from 'payload'
import { adminOnlyAccess } from '@/payload/access'

export const PaymentWebhooks: CollectionConfig = {
  slug: 'payment-webhooks',
  timestamps: true,
  access: adminOnlyAccess,
  fields: [
    {
      name: 'provider',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'text',
      required: true,
    },
    {
      name: 'providerEventId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'payload',
      type: 'json',
    },
    {
      name: 'signature',
      type: 'text',
    },
    {
      name: 'processedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'processingResult',
      type: 'select',
      options: [
        { label: 'Success', value: 'success' },
        { label: 'Failed', value: 'failed' },
        { label: 'Skipped', value: 'skipped' },
      ],
    },
    {
      name: 'processingError',
      type: 'textarea',
    },
    {
      name: 'retryCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'receivedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
