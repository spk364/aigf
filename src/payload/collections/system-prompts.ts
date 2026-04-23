// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const SystemPrompts: CollectionConfig = {
  slug: 'system-prompts',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['key', 'language', 'version'] },
  ],
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'language',
      type: 'select',
      required: true,
      options: [
        { label: 'English', value: 'en' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
        { label: 'All', value: 'all' },
      ],
    },
    {
      name: 'version',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'template',
      type: 'textarea',
      required: true,
    },
    {
      name: 'variables',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'targetModel',
      type: 'text',
    },
    {
      name: 'rolloutPercentage',
      type: 'number',
      defaultValue: 100,
      min: 0,
      max: 100,
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'activatedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
