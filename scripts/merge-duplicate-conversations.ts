// One-time cleanup: collapse duplicate conversations down to one unified thread
// per (user, character). Historically every /chat/new tap created a fresh
// conversation, so "your conversations" showed the same companion many times.
// The app code now finds-or-reuses the existing thread; this script repairs the
// rows already in the database.
//
// For each (userId, characterId) group with more than one live conversation it:
//   1. picks a canonical thread (most-recently-active, matching the app's
//      find-existing-conversation tiebreak),
//   2. re-points every message and memory-entry from the duplicates onto it,
//   3. recomputes the canonical's denormalized counters (messageCount,
//      lastMessageAt, lastMessagePreview, daysActiveCount, relationshipScore),
//   4. soft-deletes the now-empty duplicate threads.
//
// SAFE BY DEFAULT: runs as a dry-run and only prints the plan. Pass --apply to
// actually write. Pass --user <id> to limit the run to a single user.
//
// Usage:
//   pnpm tsx --env-file-if-exists=.env.local scripts/merge-duplicate-conversations.ts            # dry run
//   pnpm tsx --env-file-if-exists=.env.local scripts/merge-duplicate-conversations.ts --apply    # execute
//   pnpm tsx --env-file-if-exists=.env.local scripts/merge-duplicate-conversations.ts --apply --user 42

import 'tsx'
import { getPayload } from 'payload'
import config from '../src/payload/payload.config'
import { computeRelationshipScore } from '../src/features/chat/relationship-score'

type Payload = Awaited<ReturnType<typeof getPayload>>

function relId(rel: unknown): string | null {
  if (rel == null) return null
  if (typeof rel === 'object') {
    const obj = rel as { id?: string | number }
    return obj.id != null ? String(obj.id) : null
  }
  return String(rel)
}

// Fetch every doc matching a query, paging through Payload's pagination.
async function findAll<T extends { id: string | number }>(
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  sort?: string | string[],
): Promise<T[]> {
  const out: T[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      where: where as never,
      sort: sort as never,
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
    })
    out.push(...(res.docs as unknown as T[]))
    if (!res.hasNextPage) break
    page += 1
  }
  return out
}

type Conv = {
  id: string | number
  userId: unknown
  characterId: unknown
  lastMessageAt?: string | null
  createdAt?: string | null
}

type Msg = {
  id: string | number
  role?: string | null
  content?: string | null
  createdAt?: string | null
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const userIdx = args.indexOf('--user')
  const onlyUserId = userIdx >= 0 ? args[userIdx + 1] : null

  const payload = await getPayload({ config })

  const convWhere: Record<string, unknown> = { deletedAt: { exists: false } }
  if (onlyUserId) convWhere.userId = { equals: onlyUserId }

  const conversations = await findAll<Conv>(payload, 'conversations', convWhere)

  // Group live conversations by (userId, characterId).
  const groups = new Map<string, Conv[]>()
  for (const conv of conversations) {
    const u = relId(conv.userId)
    const c = relId(conv.characterId)
    if (!u || !c) continue
    const key = `${u}::${c}`
    const arr = groups.get(key) ?? []
    arr.push(conv)
    groups.set(key, arr)
  }

  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1)

  console.log(
    `${apply ? '[APPLY]' : '[DRY-RUN]'} scanned ${conversations.length} live conversations; ` +
      `${dupGroups.length} (user, character) pairs have duplicates.`,
  )

  let mergedThreads = 0
  let movedMessages = 0
  let movedMemories = 0

  for (const [key, arr] of dupGroups) {
    // Canonical = most-recently-active, tiebreak newest created — same order
    // the running app uses to re-open a thread.
    const sorted = [...arr].sort((a, b) => {
      const al = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0
      const bl = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0
      if (bl !== al) return bl - al
      const ac = a.createdAt ? Date.parse(a.createdAt) : 0
      const bc = b.createdAt ? Date.parse(b.createdAt) : 0
      return bc - ac
    })
    const canonical = sorted[0]!
    const duplicates = sorted.slice(1)

    console.log(
      `\n${key}: keeping #${canonical.id}, merging ${duplicates.length} duplicate(s) ` +
        `[${duplicates.map((d) => `#${d.id}`).join(', ')}]`,
    )

    for (const dup of duplicates) {
      const msgs = await findAll<Msg>(payload, 'messages', {
        conversationId: { equals: dup.id },
      })
      const mems = await findAll(payload, 'memory-entries', {
        conversationId: { equals: dup.id },
      })

      console.log(`  #${dup.id}: ${msgs.length} message(s), ${mems.length} memory-entr(y/ies)`)
      movedMessages += msgs.length
      movedMemories += mems.length

      if (apply) {
        if (msgs.length > 0) {
          await payload.update({
            collection: 'messages',
            where: { conversationId: { equals: dup.id } } as never,
            data: { conversationId: canonical.id } as never,
            overrideAccess: true,
          })
        }
        if (mems.length > 0) {
          await payload.update({
            collection: 'memory-entries',
            where: { conversationId: { equals: dup.id } } as never,
            data: { conversationId: canonical.id } as never,
            overrideAccess: true,
          })
        }
        // Soft-delete + archive the now-empty duplicate.
        await payload.update({
          collection: 'conversations',
          id: dup.id,
          data: { deletedAt: new Date().toISOString(), status: 'archived' },
          overrideAccess: true,
        })
      }
      mergedThreads += 1
    }

    if (apply) {
      // Recompute the canonical's denormalized counters from the unified
      // message set (user/assistant, non-deleted), chronological.
      const allMsgs = await findAll<Msg>(
        payload,
        'messages',
        {
          and: [
            { conversationId: { equals: canonical.id } },
            { role: { in: ['user', 'assistant'] } },
            { deletedAt: { exists: false } },
          ],
        },
        'createdAt',
      )

      const messageCount = allMsgs.length
      const last = allMsgs[allMsgs.length - 1]
      const lastMessageAt = last?.createdAt ?? canonical.lastMessageAt ?? null
      const lastMessagePreview = (last?.content ?? '').slice(0, 120)
      const days = new Set(
        allMsgs
          .map((m) => (m.createdAt ? m.createdAt.slice(0, 10) : null))
          .filter((d): d is string => !!d),
      )
      const daysActiveCount = days.size

      await payload.update({
        collection: 'conversations',
        id: canonical.id,
        data: {
          messageCount,
          lastMessageAt,
          lastMessagePreview,
          daysActiveCount,
          relationshipScore: computeRelationshipScore({
            messageCount,
            daysActiveCount,
            lastMessageAt,
          }),
        },
        overrideAccess: true,
      })
      console.log(
        `  → canonical #${canonical.id} recomputed: ${messageCount} msgs, ${daysActiveCount} active day(s)`,
      )
    }
  }

  console.log(
    `\n${apply ? 'Done' : 'Dry-run complete'}: ` +
      `${mergedThreads} duplicate thread(s) ${apply ? 'merged' : 'would be merged'}, ` +
      `${movedMessages} message(s) and ${movedMemories} memory-entr(y/ies) ${apply ? 'moved' : 'would move'}.`,
  )
  if (!apply && mergedThreads > 0) {
    console.log('Re-run with --apply to perform the merge.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
