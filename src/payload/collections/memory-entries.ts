// Memory entries for the two-level memory system (spec §3.6).
// The `embedding` vector(1536) column is NOT declared here — Payload doesn't
// support the pgvector type. It is added via a supplemental raw SQL migration:
//   migrations/0001_memory_embeddings.sql
// Insert/query of the embedding column uses payload.db.pool directly.
import type { CollectionConfig } from 'payload'

export const MemoryEntries: CollectionConfig = {
  slug: 'memory-entries',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['userId', 'characterId', 'deletedAt'] },
    { fields: ['category'] },
    { fields: ['importance'] },
    { fields: ['extractedAt'] },
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
      name: 'conversationId',
      type: 'relationship',
      relationTo: 'conversations',
      index: true,
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Personal Info', value: 'personal_info' },
        { label: 'Preference', value: 'preference' },
        { label: 'Event', value: 'event' },
        { label: 'Relationship', value: 'relationship' },
        { label: 'Sensitive', value: 'sensitive' },
      ],
    },
    // The extracted fact in natural language.
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
    // 1 (low) – 5 (critical). Boosts similarity ranking in retrieval.
    {
      name: 'importance',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 5,
    },
    // True once the user explicitly confirms the fact.
    {
      name: 'verified',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'extractedFromMessageId',
      type: 'relationship',
      relationTo: 'messages',
    },
    {
      name: 'extractedAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    // embeddingModel stores which OpenAI model produced the vector, so stale
    // embeddings can be re-computed if the model changes.
    {
      name: 'embeddingModel',
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
