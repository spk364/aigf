// TODO(phase-3-auth): tighten access control
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
    { fields: ['kind', 'isPublished', 'displayOrder'] },
    { fields: ['createdBy', 'deletedAt'] },
    { fields: ['contentRating', 'isPublished'] },
    { fields: ['landingFeatured', 'landingOrder'] },
    { fields: ['moderationStatus'] },
    { fields: ['kind', 'isPublished', 'landingFeatured'] },
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
    // ── Localized text fields ─────────────────────────────────────────────────
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
    },
    {
      name: 'tagline',
      type: 'text',
      localized: true,
    },
    {
      name: 'shortBio',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'systemPrompt',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'systemPromptVersion',
      type: 'number',
      defaultValue: 1,
    },
    // communicationStyle is JSON containing petNamesForUser (locale-specific)
    {
      name: 'communicationStyle',
      type: 'json',
      localized: true,
    },
    // backstory contains occupation + interests (locale-specific)
    {
      name: 'backstory',
      type: 'json',
      localized: true,
    },
    // ── Shared (non-localized) fields ─────────────────────────────────────────
    {
      name: 'primaryImageId',
      type: 'relationship',
      relationTo: 'media-assets',
    },
    {
      name: 'referenceImageId',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: { description: 'Primary reference image used for consistency in generation.' },
    },
    {
      name: 'referenceImageUrl',
      type: 'text',
      admin: { description: 'Public URL of the reference image (denormalized for fast access in generation).' },
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
      ],
    },
    {
      name: 'appearance',
      type: 'json',
      admin: {
        description:
          'Visual attributes + pre-assembled SD prompts. Set appearancePrompt, negativePrompt, safetyAdultMarkers for image gen.',
      },
    },
    {
      name: 'imageModel',
      type: 'json',
      admin: {
        description: 'Image generation model config: { primary, fallback }.',
      },
    },
    {
      name: 'userContentPreferences',
      type: 'json',
      admin: {
        description:
          'Custom character content prefs: { contentIntensity, preferredDynamic, hardLimits[] }. Null for presets.',
      },
    },
    {
      name: 'voiceId',
      type: 'text',
      admin: {
        description:
          'Curated voice id from src/shared/ai/voice-catalog.ts. Drives greeting generation + chat TTS.',
      },
    },
    {
      name: 'greetingAudioAssetId',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        description:
          'Pre-generated greeting clip — played on the character card and as the first chat utterance.',
      },
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
      admin: {
        description: 'Featured in authenticated catalog (post-login).',
      },
    },
    {
      name: 'landingFeatured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Show on the public landing showcase (pre-auth). Forced SFW only — see spec §3.2.1.',
      },
    },
    {
      name: 'landingOrder',
      type: 'number',
      admin: {
        description: 'Order on the public landing showcase. Lower = earlier. NULLs sort last.',
      },
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
    {
      name: 'uploadMedia',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/CharacterUploadMedia#CharacterUploadMedia',
        },
      },
    },
    {
      name: 'mediaGallery',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/CharacterMediaGallery#CharacterMediaGallery',
        },
      },
    },
    {
      name: 'generateImageAction',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/GenerateImageButton#GenerateImageButton',
        },
      },
    },
    {
      name: 'generateVideoAction',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/GenerateVideoButton#GenerateVideoButton',
        },
      },
    },
    {
      name: 'characterVideos',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/CharacterVideos#CharacterVideos',
        },
      },
    },
    {
      name: 'voicePicker',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/VoicePicker#VoicePicker',
        },
      },
    },
    {
      name: 'generateGreetingAction',
      type: 'ui',
      admin: {
        components: {
          Field: '@/payload/admin-components/GenerateGreetingButton#GenerateGreetingButton',
        },
      },
    },
  ],
}
