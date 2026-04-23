// TODO(phase-3-auth): tighten access control
// TODO(phase-3-task-N): appearance jsonb, imageModel jsonb, userContentPreferences jsonb
import type { CollectionConfig } from 'payload'

export const Characters: CollectionConfig = {
  slug: 'characters',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['localeGroupId', 'language'] },
    { fields: ['language', 'kind', 'isPublished'] },
    { fields: ['createdBy', 'deletedAt'] },
    { fields: ['kind', 'isPublished', 'displayOrder'] },
    { fields: ['contentRating', 'isPublished'] },
    { fields: ['moderationStatus'] },
  ],
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Preset', value: 'preset' },
        { label: 'Custom', value: 'custom' },
      ],
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
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
      name: 'localeGroupId',
      type: 'text',
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
    },
    {
      name: 'tagline',
      type: 'text',
    },
    {
      name: 'shortBio',
      type: 'textarea',
    },
    {
      name: 'primaryImageId',
      type: 'relationship',
      relationTo: 'media-assets',
    },
    {
      name: 'galleryImageIds',
      type: 'relationship',
      relationTo: 'media-assets',
      hasMany: true,
    },
    {
      name: 'artStyle',
      type: 'select',
      options: [
        { label: 'Realistic', value: 'realistic' },
        { label: 'Anime', value: 'anime' },
        { label: '3D Render', value: '3d_render' },
        { label: 'Stylized', value: 'stylized' },
      ],
    },
    {
      name: 'archetype',
      type: 'text',
    },
    {
      name: 'personalityTraits',
      type: 'json',
    },
    {
      name: 'communicationStyle',
      type: 'json',
    },
    {
      name: 'backstory',
      type: 'json',
    },
    {
      name: 'systemPrompt',
      type: 'textarea',
    },
    {
      name: 'systemPromptVersion',
      type: 'number',
      defaultValue: 1,
    },
    {
      name: 'contentRating',
      type: 'select',
      options: [
        { label: 'SFW', value: 'sfw' },
        { label: 'NSFW Soft', value: 'nsfw_soft' },
        { label: 'NSFW Explicit', value: 'nsfw_explicit' },
      ],
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'moderationStatus',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Flagged', value: 'flagged' },
      ],
    },
    {
      name: 'moderatedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'moderatedBy',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'rejectionReason',
      type: 'text',
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'displayOrder',
      type: 'number',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'conversationCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'messageCount',
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
