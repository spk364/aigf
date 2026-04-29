// Soft-delete where-clause helpers.
// Collections with deletedAt (soft delete): users, characters, conversations,
// messages, character-drafts, media-assets.
// All read queries on these collections should call addSoftDeleteFilter() so
// deleted records never leak into responses.

import type { Where } from 'payload'

/** Merge `deletedAt IS NULL` into an existing Where clause. */
export function addSoftDeleteFilter(where?: Where): Where {
  const notDeleted: Where = { deletedAt: { equals: null } }
  if (!where) return notDeleted
  // Wrap in AND to preserve caller's conditions.
  return { and: [where, notDeleted] }
}

/** Short alias. */
export const notDeleted: Where = { deletedAt: { equals: null } }
