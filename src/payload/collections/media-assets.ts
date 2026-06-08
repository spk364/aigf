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
  // Lead the list view with a thumbnail of the asset (rendered by the
  // custom Cell on `publicUrl` below) so admins can scan generated images
  // / videos straight from the table without opening each row.
  admin: {
    defaultColumns: ['publicUrl', 'kind', 'mimeType', 'ownerCharacterId', 'createdAt'],
    useAsTitle: 'storageKey',
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
        { label: 'Character Backdrop', value: 'character_backdrop' },
        { label: 'Generated Message', value: 'generated_message' },
        { label: 'Generated Video', value: 'generated_video' },
        { label: 'Video Source Image', value: 'video_source_image' },
        { label: 'User Avatar', value: 'user_avatar' },
        { label: 'Voice Preview', value: 'voice_preview' },
        { label: 'Character Voice Greeting', value: 'character_voice_greeting' },
        { label: 'Voice Message', value: 'voice_message' },
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
      admin: {
        // Render the value as a thumbnail in the list-view table. Edit
        // form still shows a normal text input.
        components: {
          Cell: '@/payload/admin-components/MediaAssetThumbnailCell#MediaAssetThumbnailCell',
        },
      },
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
