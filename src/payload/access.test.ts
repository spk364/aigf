import { describe, expect, it } from 'vitest'
import type { CollectionConfig, PayloadRequest } from 'payload'
import { Admins } from './collections/admins'
import { AgeVerifications } from './collections/age-verifications'
import { AuditLogs } from './collections/audit-logs'
import { Banners } from './collections/banners'
import { CharacterDrafts } from './collections/character-drafts'
import { Characters } from './collections/characters'
import { ContentFlags } from './collections/content-flags'
import { Conversations } from './collections/conversations'
import { FeatureFlags } from './collections/feature-flags'
import { MediaAssets } from './collections/media-assets'
import { MemoryEntries } from './collections/memory-entries'
import { MemoryProfiles } from './collections/memory-profiles'
import { Messages } from './collections/messages'
import { PaymentTransactions } from './collections/payment-transactions'
import { PaymentWebhooks } from './collections/payment-webhooks'
import { PaywallBlocks } from './collections/paywall-blocks'
import { SafetyIncidents } from './collections/safety-incidents'
import { Subscriptions } from './collections/subscriptions'
import { SystemPrompts } from './collections/system-prompts'
import { TokenBalances } from './collections/token-balances'
import { TokenPackages } from './collections/token-packages'
import { TokenTransactions } from './collections/token-transactions'
import { Users } from './collections/users'
import { isAdminUser } from './access'

// Keep in sync with `collections` in payload.config.ts — a new collection that
// isn't listed here isn't covered by the lockdown checks below.
const ADMIN_ONLY: CollectionConfig[] = [
  Admins,
  AgeVerifications,
  AuditLogs,
  Banners,
  CharacterDrafts,
  Characters,
  ContentFlags,
  Conversations,
  FeatureFlags,
  MediaAssets,
  MemoryEntries,
  MemoryProfiles,
  Messages,
  PaymentTransactions,
  PaymentWebhooks,
  PaywallBlocks,
  SafetyIncidents,
  Subscriptions,
  SystemPrompts,
  TokenBalances,
  TokenPackages,
  TokenTransactions,
]

const OPS = ['read', 'create', 'update', 'delete'] as const

const anon = { user: null } as unknown as PayloadRequest
const member = { user: { id: 42, collection: 'users', roles: ['user'] } } as unknown as PayloadRequest
// A leftover 'admin' role on a customer must not count: only the admins table does.
const legacyAdminRole = {
  user: { id: 43, collection: 'users', roles: ['admin', 'user'] },
} as unknown as PayloadRequest
const admin = { user: { id: 1, collection: 'admins' } } as unknown as PayloadRequest

function run(c: CollectionConfig, op: (typeof OPS)[number], req: PayloadRequest): unknown {
  const fn = c.access?.[op]
  if (!fn) throw new Error(`${c.slug}.access.${op} is not defined — Payload would fall back to "any logged-in user"`)
  return (fn as (args: { req: PayloadRequest }) => unknown)({ req })
}

describe('isAdminUser', () => {
  it('is true only for a user from the admins collection', () => {
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser({ collection: 'users', roles: ['admin'] })).toBe(false)
    expect(isAdminUser({ roles: ['admin'] })).toBe(false)
    expect(isAdminUser({ collection: 'admins' })).toBe(true)
  })
})

describe.each(ADMIN_ONLY.map((c) => [c.slug, c] as const))('%s', (_slug, collection) => {
  it.each(OPS)('%s is closed to anonymous and regular users, open to admins', (op) => {
    expect(run(collection, op, anon)).toBe(false)
    expect(run(collection, op, member)).toBe(false)
    expect(run(collection, op, legacyAdminRole)).toBe(false)
    expect(run(collection, op, admin)).toBe(true)
  })
})

describe('/admin sign-in', () => {
  const panel = (c: CollectionConfig, req: PayloadRequest) =>
    (c.access?.admin as (args: { req: PayloadRequest }) => boolean)({ req })

  it('admits admins only', () => {
    expect(panel(Admins, anon)).toBe(false)
    expect(panel(Admins, member)).toBe(false)
    expect(panel(Admins, legacyAdminRole)).toBe(false)
    expect(panel(Admins, admin)).toBe(true)
  })

  it('never admits anyone through the users collection', () => {
    for (const req of [anon, member, legacyAdminRole, admin]) expect(panel(Users, req)).toBe(false)
  })
})

describe('users', () => {

  it('lets a regular user read only their own row', () => {
    expect(run(Users, 'read', anon)).toBe(false)
    expect(run(Users, 'read', member)).toEqual({ id: { equals: 42 } })
    expect(run(Users, 'read', admin)).toBe(true)
  })

  it.each(['create', 'update', 'delete'] as const)('%s over REST is admin-only', (op) => {
    // Self-update must stay closed: a user could PATCH their own status or flags.
    expect(run(Users, op, anon)).toBe(false)
    expect(run(Users, op, member)).toBe(false)
    expect(run(Users, op, legacyAdminRole)).toBe(false)
    expect(run(Users, op, admin)).toBe(true)
  })
})
