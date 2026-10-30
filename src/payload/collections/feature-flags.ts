import type { CollectionConfig } from 'payload'
import { adminOnlyAccess } from '@/payload/access'

export const FeatureFlags: CollectionConfig = {
  slug: 'feature-flags',
  timestamps: true,
  access: adminOnlyAccess,
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'rolloutPercentage',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 100,
    },
    {
      name: 'userAllowlist',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
