// Single source of truth for where a user's data lives. Drives BOTH the data
// export (GDPR Art. 15/20) and the post-deletion purge (Art. 17). Adding a new
// user-linked collection? Add one entry here and both flows pick it up.
//
// `userField` is the relationship field that points at the user. `messages` has
// none (it links through conversations) and is handled specially in both flows.

export type CollectionSlug =
  | 'age-verifications'
  | 'character-drafts'
  | 'characters'
  | 'content-flags'
  | 'conversations'
  | 'media-assets'
  | 'memory-entries'
  | 'payment-transactions'
  | 'safety-incidents'
  | 'subscriptions'
  | 'token-balances'
  | 'token-transactions'

export type UserDataSource = {
  collection: CollectionSlug
  // The relationship field pointing at the user.
  userField: string
  // Include in the user-facing data export? Safety/abuse records are excluded
  // under the fraud-prevention / legitimate-interest exemption — exporting them
  // would also coach evasion of the safety filters.
  export: boolean
  // What the 90-day purge does:
  //   'delete'    — hard-delete the rows (personal content).
  //   'retain'    — keep the rows (legal retention: financial 7yr, age/safety
  //                 7yr). They keep pointing at the now-anonymized user row.
  purge: 'delete' | 'retain'
}

export const USER_DATA_SOURCES: UserDataSource[] = [
  // Personal content — exported, then purged.
  { collection: 'conversations', userField: 'userId', export: true, purge: 'delete' },
  { collection: 'memory-entries', userField: 'userId', export: true, purge: 'delete' },
  { collection: 'character-drafts', userField: 'userId', export: true, purge: 'delete' },
  { collection: 'characters', userField: 'createdBy', export: true, purge: 'delete' },
  { collection: 'media-assets', userField: 'ownerUserId', export: true, purge: 'delete' },
  { collection: 'token-balances', userField: 'userId', export: true, purge: 'delete' },

  // Financial records — exported (the user's own purchases) but RETAINED for
  // tax/accounting obligations (~7 years).
  { collection: 'payment-transactions', userField: 'userId', export: true, purge: 'retain' },
  { collection: 'token-transactions', userField: 'userId', export: true, purge: 'retain' },
  { collection: 'subscriptions', userField: 'userId', export: true, purge: 'retain' },

  // Compliance records — RETAINED 7 years, and NOT exported.
  { collection: 'age-verifications', userField: 'userId', export: false, purge: 'retain' },
  { collection: 'safety-incidents', userField: 'userId', export: false, purge: 'retain' },
  { collection: 'content-flags', userField: 'userId', export: false, purge: 'retain' },
]

// Days after soft-deletion (users.deletedAt) before the purge runs.
export const PURGE_GRACE_DAYS = 90

// PII fields on the users row that the purge nulls out. The row itself is kept
// (not hard-deleted) so retained financial/compliance records keep a valid FK.
export const USER_PII_FIELDS = [
  'displayName',
  'avatarUrl',
  'googleId',
  'timezone',
  'dateOfBirth',
  'preferredLanguage',
] as const
