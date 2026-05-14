// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const Banners: CollectionConfig = {
  slug: 'banners',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  admin: {
    useAsTitle: 'internalName',
    defaultColumns: ['internalName', 'pages', 'isActive', 'displayOrder', 'startsAt', 'endsAt'],
  },
  indexes: [
    { fields: ['isActive', 'displayOrder'] },
    { fields: ['deletedAt'] },
  ],
  fields: [
    {
      name: 'internalName',
      type: 'text',
      required: true,
      admin: {
        description: 'Admin-only label so editors can identify this banner in the list view.',
      },
    },
    {
      name: 'pages',
      type: 'select',
      hasMany: true,
      required: true,
      options: [
        { label: 'Home (/)', value: 'home' },
        { label: 'AI Girlfriend (/ai-girlfriend)', value: 'girls' },
        { label: 'AI Anime (/ai-anime)', value: 'anime' },
        { label: 'AI Boyfriend (/ai-boyfriend)', value: 'boys' },
      ],
      admin: {
        description:
          'Where this banner appears. Choose one or several public catalog pages.',
      },
    },
    {
      name: 'image',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        description:
          'Background image. Optional — when empty, a generated gradient is used as fallback.',
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      admin: {
        description:
          'Optional direct image URL. Takes precedence over the relationship above when set (useful for quick CMS edits without uploading).',
      },
    },
    {
      name: 'eyebrow',
      type: 'text',
      localized: true,
      admin: { description: 'Small badge above the title (e.g. "Featured", "New").' },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'subtitle',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'ctaLabel',
      type: 'text',
      localized: true,
    },
    {
      name: 'ctaHref',
      type: 'text',
      admin: {
        description:
          'Absolute path (e.g. "/start") or full URL. The current locale is prepended automatically if the path starts with "/".',
      },
    },
    {
      name: 'hueA',
      type: 'number',
      defaultValue: 320,
      admin: { description: 'Gradient hue A (0-360). Used only when no image is set.' },
    },
    {
      name: 'hueB',
      type: 'number',
      defaultValue: 280,
      admin: { description: 'Gradient hue B (0-360). Used only when no image is set.' },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Lower = earlier. NULLs sort last.' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'startsAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'endsAt',
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
