// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'status', 'deletedAt', 'lastMessageAt'] },
    { fields: ['userId', 'characterId'] },
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
      name: 'characterId',
      type: 'relationship',
      relationTo: 'characters',
      required: true,
      index: true,
    },
    {
      name: 'characterSnapshot',
      type: 'json',
    },
    {
      name: 'snapshotVersion',
      type: 'number',
    },
    {
      name: 'llmConfig',
      type: 'json',
    },
    {
      name: 'language',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
      ],
    },
    {
      name: 'languageDetectedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'languageManuallySet',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
    },
    {
      name: 'summaryUpToMessageId',
      type: 'relationship',
      relationTo: 'messages',
    },
    {
      name: 'summaryUpdatedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'messageCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'lastMessageAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastMessagePreview',
      type: 'text',
    },
    {
      name: 'relationshipScore',
      type: 'number',
      defaultValue: 0,
    },
    // Count of distinct UTC calendar days with at least one message.
    // Incremented in the chat route whenever the current day differs from lastMessageAt.
    {
      name: 'daysActiveCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'deletedAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
