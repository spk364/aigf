// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const Messages: CollectionConfig = {
  slug: 'messages',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['conversationId', 'createdAt', 'deletedAt'] },
    { fields: ['conversationId', 'role', 'createdAt'] },
    { fields: ['regeneratedFromId'] },
  ],
  fields: [
    {
      name: 'conversationId',
      type: 'relationship',
      relationTo: 'conversations',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: [
        { label: 'User', value: 'user' },
        { label: 'Assistant', value: 'assistant' },
        { label: 'System', value: 'system' },
      ],
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Text', value: 'text' },
        { label: 'Image', value: 'image' },
        { label: 'Video', value: 'video' },
        { label: 'Image Request', value: 'image_request' },
        { label: 'Video Request', value: 'video_request' },
        { label: 'Action', value: 'action' },
      ],
    },
    {
      name: 'content',
      type: 'textarea',
    },
    {
      name: 'imageAssetId',
      type: 'relationship',
      relationTo: 'media-assets',
    },
    {
      name: 'videoAssetId',
      type: 'relationship',
      relationTo: 'media-assets',
    },
    {
      name: 'generationMetadata',
      type: 'json',
    },
    {
      name: 'userTokensSpent',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'spendType',
      type: 'select',
      options: [
        { label: 'Free', value: 'free' },
        { label: 'Subscription', value: 'subscription' },
        { label: 'Image', value: 'image' },
        { label: 'Video', value: 'video' },
        { label: 'Regeneration Image', value: 'regeneration_image' },
        { label: 'Regeneration Video', value: 'regeneration_video' },
      ],
    },
    {
      name: 'regeneratedFromId',
      type: 'relationship',
      relationTo: 'messages',
      index: true,
    },
    {
      name: 'isRegenerated',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'safetyFlags',
      type: 'json',
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Streaming', value: 'streaming' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Flagged', value: 'flagged' },
      ],
    },
    {
      name: 'errorReason',
      type: 'text',
    },
    {
      name: 'completedAt',
      type: 'date',
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
