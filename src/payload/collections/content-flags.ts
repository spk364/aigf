// Lightweight behavioural flags. One row per blocked action — cheap to write
// on the hot path. Drives the "N strikes in a window" escalation logic in
// src/features/safety/escalation.ts. Heavier review-worthy events also get a
// safety_incidents row; this table is the high-volume counter.
//
// Data-model §6. Partition by month + retain ~1 year once volume warrants
// (raw SQL via afterMigrate — not needed at launch scale).
// TODO(phase-3-auth): tighten access control to admin-only reads.
import type { CollectionConfig } from 'payload'

export const ContentFlags: CollectionConfig = {
  slug: 'content-flags',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    // Powers the escalation window query: flags for a user, newest first.
    { fields: ['userId', 'flagType', 'createdAt'] },
    { fields: ['userId', 'createdAt'] },
  ],
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'flagType',
      type: 'select',
      required: true,
      options: [
        { label: 'Blocked Input', value: 'blocked_input' },
        { label: 'Blocked Output', value: 'blocked_output' },
        { label: 'Blocked Image', value: 'blocked_image' },
        { label: 'Rate Limit Hit', value: 'rate_limit_hit' },
      ],
      index: true,
    },
    {
      // { category, reason, matched?, scoringDetails?, source: 'web'|'telegram', preview? }.
      // Keep PII-light — store a short matched-term list, not the full message.
      name: 'context',
      type: 'json',
    },
  ],
}
