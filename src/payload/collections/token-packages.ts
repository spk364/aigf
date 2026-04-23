// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const TokenPackages: CollectionConfig = {
  slug: 'token-packages',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'sku',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'displayName',
      type: 'json',
    },
    {
      name: 'tokenAmount',
      type: 'number',
      required: true,
    },
    {
      name: 'priceCents',
      type: 'number',
      required: true,
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'displayOrder',
      type: 'number',
    },
    {
      name: 'badgeText',
      type: 'json',
    },
  ],
}
