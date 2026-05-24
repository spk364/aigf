// Account-status gate. The safety escalation (src/features/safety/escalation.ts)
// writes users.status = 'suspended' | 'banned', but that only has teeth if
// request entry points actually check it. This pure helper is the single source
// of truth for "is this user currently allowed to act".
//
// A suspension auto-expires once suspendedUntil passes — we treat it as allowed
// without rewriting status (a cron / next login can reset the row).

export type AccountState =
  | { blocked: false }
  | { blocked: true; reason: 'banned' | 'suspended' | 'deleted'; until: string | null }

// Index signature so the Payload user doc (JsonObject & TypeWithID) is
// assignable without TS's weak-type check rejecting an all-optional shape.
type UserLike = {
  status?: string | null
  suspendedUntil?: string | null
  [k: string]: unknown
}

export function getAccountState(user: UserLike | null | undefined): AccountState {
  if (!user) return { blocked: false }
  const status = user.status ?? 'active'

  if (status === 'banned') return { blocked: true, reason: 'banned', until: null }
  if (status === 'deleted') return { blocked: true, reason: 'deleted', until: null }

  if (status === 'suspended') {
    const until = user.suspendedUntil ?? null
    // Expired suspension → allowed again.
    if (until && Date.parse(until) <= Date.now()) return { blocked: false }
    return { blocked: true, reason: 'suspended', until }
  }

  return { blocked: false }
}
