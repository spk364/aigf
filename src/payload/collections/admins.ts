import type { CollectionConfig } from 'payload'
import { adminOnlyAccess, canAccessAdminPanel } from '@/payload/access'

// Who may sign in to /admin. Deliberately separate from `users` (the site's
// customers): no signup, no OAuth, no role field to escalate. Being a row here
// IS the admin check (see isAdminUser). New admins are added from inside the
// admin panel by an existing admin; Payload's create-first-user screen only
// shows while this table is empty.
export const Admins: CollectionConfig = {
  slug: 'admins',
  auth: {
    tokenExpiration: 8 * 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  timestamps: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    admin: canAccessAdminPanel,
    ...adminOnlyAccess,
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
    },
  ],
}
