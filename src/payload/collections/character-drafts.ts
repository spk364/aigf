// TODO(phase-3-auth): tighten access control
// TODO(draft-ttl-cleanup): add a scheduled cron to purge rows where expiresAt < now
import type { CollectionConfig } from 'payload'

export const CharacterDrafts: CollectionConfig = {
  slug: 'character-drafts',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'deletedAt'] },
    { fields: ['expiresAt'] },
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
      name: 'language',
      type: 'select',
      required: true,
      options: [
        { label: 'English', value: 'en' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
      ],
    },
    {
      name: 'currentStep',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 4,
    },
    {
      name: 'data',
      type: 'json',
      defaultValue: {},
    },
    {
      name: 'previewGenerations',
      type: 'json',
      defaultValue: [],
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'deletedAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
