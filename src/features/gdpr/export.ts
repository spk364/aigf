import 'server-only'
import type { BasePayload } from 'payload'
import { USER_DATA_SOURCES } from './data-map'

// Assembles a complete export of a user's personal data (GDPR Art. 15/20) into
// a plain JSON object. Excludes safety/abuse records (see data-map.ts) and
// never includes credentials (Payload's auth fields are stripped below).
//
// Volume note: conversations can be large. We cap each collection at a generous
// limit and note truncation in the payload rather than streaming — a paginated
// streaming export can come later if anyone hits the cap.

const PER_COLLECTION_LIMIT = 5000

type ExportSection = {
  count: number
  truncated: boolean
  records: unknown[]
}

export type UserDataExport = {
  exportedAt: string
  userId: string | number
  profile: Record<string, unknown>
  data: Record<string, ExportSection>
  messages: ExportSection
}

// Fields on the users row that must never leave the building.
const PROFILE_REDACT = new Set([
  'password',
  'salt',
  'hash',
  'resetPasswordToken',
  'resetPasswordExpiration',
  '_verificationToken',
  'sessions',
])

function redactProfile(user: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(user)) {
    if (PROFILE_REDACT.has(k)) continue
    out[k] = v
  }
  return out
}

export async function buildUserDataExport(
  payload: BasePayload,
  userId: string | number,
): Promise<UserDataExport> {
  // Profile.
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })

  const data: Record<string, ExportSection> = {}
  const conversationIds: (string | number)[] = []

  for (const src of USER_DATA_SOURCES) {
    if (!src.export) continue
    const res = await payload.find({
      collection: src.collection,
      where: { [src.userField]: { equals: userId } },
      limit: PER_COLLECTION_LIMIT,
      depth: 0,
      overrideAccess: true,
    })
    data[src.collection] = {
      count: res.totalDocs,
      truncated: res.totalDocs > res.docs.length,
      records: res.docs,
    }
    if (src.collection === 'conversations') {
      for (const c of res.docs) conversationIds.push(c.id)
    }
  }

  // Messages link through conversations, not directly to the user.
  let messages: ExportSection = { count: 0, truncated: false, records: [] }
  if (conversationIds.length > 0) {
    const res = await payload.find({
      collection: 'messages',
      where: { conversationId: { in: conversationIds.map(String) } },
      limit: PER_COLLECTION_LIMIT,
      depth: 0,
      overrideAccess: true,
    })
    messages = {
      count: res.totalDocs,
      truncated: res.totalDocs > res.docs.length,
      records: res.docs,
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    userId,
    profile: redactProfile(user as Record<string, unknown>),
    data,
    messages,
  }
}
