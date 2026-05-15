// TODO(phase-3-auth): tighten access control — admin-only read; system-only write
import type { CollectionConfig } from 'payload'

export const SafetyIncidents: CollectionConfig = {
  slug: 'safety-incidents',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['layer', 'category', 'createdAt'] },
    { fields: ['severity', 'createdAt'] },
  ],
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'conversationId',
      type: 'relationship',
      relationTo: 'conversations',
      index: true,
    },
    {
      name: 'messageId',
      type: 'relationship',
      relationTo: 'messages',
      index: true,
    },
    {
      name: 'characterId',
      type: 'relationship',
      relationTo: 'characters',
      index: true,
    },
    {
      name: 'layer',
      type: 'select',
      required: true,
      options: [
        { label: 'Input filter (pre-LLM)', value: 'input' },
        { label: 'Output filter (post-LLM)', value: 'output' },
        { label: 'Image generation', value: 'image' },
        { label: 'Builder (character creation)', value: 'builder' },
      ],
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      options: [
        { label: 'Soft block', value: 'soft_block' },
        { label: 'Hard block', value: 'hard_block' },
        { label: 'Critical (CSAM/illegal)', value: 'critical' },
      ],
    },
    {
      name: 'category',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'matched',
      type: 'json',
    },
    {
      name: 'inputSnippet',
      type: 'textarea',
      admin: {
        description:
          'First 240 chars of the offending input, retained for audit / forensics. Sensitive — admin access only.',
      },
    },
    {
      name: 'locale',
      type: 'text',
    },
    {
      name: 'ipAddress',
      type: 'text',
    },
    {
      name: 'userAgent',
      type: 'text',
    },
    {
      name: 'metadata',
      type: 'json',
    },
  ],
}
