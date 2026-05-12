import 'server-only'
import type { BasePayload } from 'payload'

// Whitelist of emails that bypass every per-user limit: daily message cap,
// token-balance gate, free-tier 1-character cap, premium feature checks for
// image/video generation. Driven by the ADMIN_USER_EMAILS env var (CSV).
//
// Why env var instead of a DB flag: we want the same whitelist to apply to
// preview deploys without touching the Supabase row, and we want to be able
// to flip it off without a migration. Keep the list tiny — every entry is
// effectively a god-mode user.

function getWhitelist(): Set<string> {
  const raw = process.env.ADMIN_USER_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  )
}

export function isUnlimitedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getWhitelist().has(email.toLowerCase())
}

// Looks up the user's email if not already known. Used in places that only
// carry userId on the call site (token spend/grant, balance fetch). Misses
// fail closed — a DB error means we treat the user as normal.
export async function isUnlimitedUserId(
  payload: BasePayload,
  userId: string | number,
): Promise<boolean> {
  const whitelist = getWhitelist()
  if (whitelist.size === 0) return false
  try {
    const user = await payload.findByID({
      collection: 'users',
      id: userId,
      overrideAccess: true,
    })
    const email = typeof user?.email === 'string' ? user.email.toLowerCase() : null
    return email !== null && whitelist.has(email)
  } catch {
    return false
  }
}
