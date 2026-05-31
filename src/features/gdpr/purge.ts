import 'server-only'
import type { BasePayload } from 'payload'
import { deleteObject } from '@/shared/storage'
import { createLogger } from '@/shared/lib/logger'
import { USER_DATA_SOURCES, USER_PII_FIELDS, PURGE_GRACE_DAYS } from './data-map'

const log = createLogger({ scope: 'gdpr.purge' })

export type PurgeResult = {
  userId: string | number
  deletedByCollection: Record<string, number>
  r2ObjectsDeleted: number
  messagesDeleted: number
  anonymized: boolean
}

// Hard-deletes a user's personal content and anonymizes the users row, while
// retaining legally-required financial/compliance records (see data-map.ts).
// Idempotent: re-running on an already-purged user is a no-op (queries find
// nothing, the row is already anonymized).
export async function purgeUser(
  payload: BasePayload,
  userId: string | number,
): Promise<PurgeResult> {
  const result: PurgeResult = {
    userId,
    deletedByCollection: {},
    r2ObjectsDeleted: 0,
    messagesDeleted: 0,
    anonymized: false,
  }

  // 1. Collect this user's conversation ids first — messages are deleted by
  //    conversation, and media-assets are deleted before their R2 objects.
  const convos = await payload.find({
    collection: 'conversations',
    where: { userId: { equals: userId } },
    limit: 100000,
    depth: 0,
    overrideAccess: true,
  })
  const conversationIds = convos.docs.map((c) => c.id)

  // 2. Delete the R2 objects backing this user's media before the rows go.
  const media = await payload.find({
    collection: 'media-assets',
    where: { ownerUserId: { equals: userId } },
    limit: 100000,
    depth: 0,
    overrideAccess: true,
  })
  for (const asset of media.docs) {
    const key = (asset as { storageKey?: string }).storageKey
    if (!key) continue
    try {
      await deleteObject(key)
      result.r2ObjectsDeleted++
    } catch (err) {
      // Non-fatal: orphaned R2 objects can be swept separately. Don't block the
      // DB purge on a storage hiccup.
      log.warn({ msg: 'purge.r2_delete_failed', key, err: String(err) })
    }
  }

  // 3. Delete messages of this user's conversations.
  if (conversationIds.length > 0) {
    const del = await payload.delete({
      collection: 'messages',
      where: { conversationId: { in: conversationIds.map(String) } },
      overrideAccess: true,
    })
    result.messagesDeleted = Array.isArray(del.docs) ? del.docs.length : 0
  }

  // 4. Delete every collection marked purge:'delete'.
  for (const src of USER_DATA_SOURCES) {
    if (src.purge !== 'delete') continue
    const del = await payload.delete({
      collection: src.collection,
      where: { [src.userField]: { equals: userId } },
      overrideAccess: true,
    })
    result.deletedByCollection[src.collection] = Array.isArray(del.docs) ? del.docs.length : 0
  }

  // 5. Anonymize the users row. Keep the row (so retained financial/compliance
  //    FKs stay valid) but strip PII and free the unique email.
  const anonEmail = `deleted-${userId}@deleted.invalid`
  const piiNulls = Object.fromEntries(USER_PII_FIELDS.map((f) => [f, null]))
  await payload.update({
    collection: 'users',
    id: userId,
    data: {
      ...piiNulls,
      email: anonEmail,
      status: 'deleted',
      purgedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  result.anonymized = true

  log.info({ msg: 'gdpr.user_purged', userId: String(userId), ...result.deletedByCollection })
  return result
}

// Finds users soft-deleted more than PURGE_GRACE_DAYS ago that haven't been
// purged yet, and purges each. Returns per-user results for the cron to log.
export async function purgeExpiredDeletedUsers(
  payload: BasePayload,
  opts: { limit?: number } = {},
): Promise<PurgeResult[]> {
  const cutoff = new Date(Date.now() - PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const due = await payload.find({
    collection: 'users',
    where: {
      and: [
        { status: { equals: 'deleted' } },
        { deletedAt: { less_than: cutoff } },
        { purgedAt: { exists: false } },
      ],
    },
    limit: opts.limit ?? 100,
    depth: 0,
    overrideAccess: true,
  })

  const results: PurgeResult[] = []
  for (const u of due.docs) {
    try {
      results.push(await purgeUser(payload, u.id))
    } catch (err) {
      log.error({ msg: 'gdpr.purge_failed', userId: String(u.id), err: String(err) })
    }
  }
  return results
}
