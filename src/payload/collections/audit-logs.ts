// TODO(phase-3-auth): tighten access control
import type { CollectionConfig } from 'payload'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  timestamps: true,
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  indexes: [
    { fields: ['actorId', 'createdAt'] },
    { fields: ['entityType', 'entityId'] },
  ],
  fields: [
    {
      name: 'actorType',
      type: 'select',
      required: true,
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
        { label: 'System', value: 'system' },
      ],
    },
    {
      name: 'actorId',
      type: 'text',
      index: true,
    },
    {
      name: 'action',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'entityType',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'entityId',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'changes',
      type: 'json',
    },
    {
      name: 'reason',
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
  ],
}
