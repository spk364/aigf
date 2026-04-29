// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const MediaAssets: CollectionConfig = {
  slug: 'media-assets',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['ownerCharacterId', 'kind'] },
    { fields: ['ownerUserId', 'createdAt'] },
    { fields: ['moderationStatus'] },
    { fields: ['relatedMessageId'] },
  ],
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Character Reference', value: 'character_reference' },
        { label: 'Character Gallery', value: 'character_gallery' },
        { label: 'Character Preview', value: 'character_preview' },
        { label: 'Generated Message', value: 'generated_message' },
        { label: 'Generated Video', value: 'generated_video' },
        { label: 'Video Source Image', value: 'video_source_image' },
        { label: 'User Avatar', value: 'user_avatar' },
      ],
    },
    {
      name: 'ownerUserId',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'ownerCharacterId',
      type: 'relationship',
      relationTo: 'characters',
      index: true,
    },
    {
      name: 'relatedMessageId',
      type: 'relationship',
      relationTo: 'messages',
      index: true,
    },
    {
      name: 'storageKey',
      type: 'text',
      required: true,
    },
    {
      name: 'storageProvider',
      type: 'select',
      defaultValue: 'r2',
      options: [
        { label: 'R2', value: 'r2' },
        { label: 'S3', value: 's3' },
        { label: 'Local (dev)', value: 'local' },
      ],
    },
    {
      name: 'publicUrl',
      type: 'text',
      required: true,
    },
    {
      name: 'mimeType',
      type: 'text',
      required: true,
    },
    {
      name: 'sizeBytes',
      type: 'number',
      required: true,
    },
    {
      name: 'width',
      type: 'number',
    },
    {
      name: 'height',
      type: 'number',
    },
    {
      name: 'durationSec',
      type: 'number',
    },
    {
      name: 'generationMetadata',
      type: 'json',
    },
    {
      name: 'moderationStatus',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Flagged', value: 'flagged' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    {
      name: 'moderationScores',
      type: 'json',
    },
    {
      name: 'isNsfw',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'blurredUrl',
      type: 'text',
    },
    {
      name: 'thumbnailUrl',
      type: 'text',
    },
    {
      name: 'deletedAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
