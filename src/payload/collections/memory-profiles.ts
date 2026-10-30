// Core memory: one short, always-in-prompt document per (user, character) pair.
//
// The background memory job (src/features/memory/memory-job.ts) rewrites it by
// merging what it already says with the newest messages: stable facts about the
// user, the relationship (pet names, milestones), and what the character has
// said about herself. Unlike memory-entries it is never searched — it is small
// enough to inject on every turn, so the facts that matter most never depend on
// a similarity search happening to surface them.
//
// Table created by migrations/0012_memory_v2.sql (`pnpm migrate:memory`).
import type { CollectionConfig } from 'payload'
import { adminOnlyAccess } from '@/payload/access'

export const MemoryProfiles: CollectionConfig = {
  slug: 'memory-profiles',
  timestamps: true,
  access: adminOnlyAccess,
  // One profile per (user, character) is enforced by the unique index
  // memory_profiles_user_character_unique in migrations/0012_memory_v2.sql, NOT
  // declared here: Payload would name it "userId_characterId_idx", which
  // conversations already uses (index names are schema-wide).
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
      name: 'profile',
      type: 'textarea',
    },
  ],
}
