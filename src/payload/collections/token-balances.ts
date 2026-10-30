// Only grant/spend/refundByAdmin should write to token_balances
import type { CollectionConfig } from 'payload'
import { adminOnlyAccess } from '@/payload/access'

export const TokenBalances: CollectionConfig = {
  slug: 'token-balances',
  timestamps: true,
  access: adminOnlyAccess,
  fields: [
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'balance',
      type: 'number',
      defaultValue: 0,
      required: true,
    },
    {
      name: 'lifetimeEarned',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'lifetimeSpent',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
