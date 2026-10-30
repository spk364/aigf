// Access rules for Payload collections.
//
// These rules govern Payload's REST API (`/api/<collection>` via
// src/app/(payload)/api/[...slug]/route.ts) and the admin panel — NOT the app
// itself. Every app code path uses the local API (`payload.find/create/...`),
// which defaults to `overrideAccess: true` and skips these checks entirely.
//
// Every end user holds a Payload JWT (users is the auth collection), so
// "authenticated" is NOT a meaningful gate — any signed-up account would pass.
// Until 2026-10 every collection used `() => true`, which let anyone read every
// conversation and memory, mint tokens via PATCH /api/token-balances, or POST
// /api/users with `roles: ['admin']`. Default to admin-only and open up
// deliberately.
import type { Access, PayloadRequest } from 'payload'

// `unknown` because req.user is Payload's untyped user union here.
export function isAdminUser(user: unknown): boolean {
  if (typeof user !== 'object' || user === null) return false
  const roles = (user as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('admin')
}

export const adminOnly: Access = ({ req }) => isAdminUser(req.user)

/** Admins see every row; any other signed-in user sees only their own. */
export const adminOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  return { id: { equals: req.user.id } }
}

/** For `access.admin` on the auth collection — who may open /admin at all. */
export const canAccessAdminPanel = ({ req }: { req: PayloadRequest }): boolean =>
  isAdminUser(req.user)

/** The access block nearly every collection should use. */
export const adminOnlyAccess = {
  read: adminOnly,
  create: adminOnly,
  update: adminOnly,
  delete: adminOnly,
}
