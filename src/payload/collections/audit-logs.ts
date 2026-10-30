import type { CollectionConfig } from 'payload'
import { adminOnlyAccess } from '@/payload/access'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  timestamps: true,
  access: adminOnlyAccess,
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
