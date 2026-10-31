// Clear a conversation: a full "start over" with this character.
//
// Wipes everything that carries the relationship forward, so the next message
// meets a character who has never spoken to the user:
//   - every message in the thread is soft-deleted, photos and videos included,
//     so the chat comes back empty except for a fresh greeting. The
//     photos stay in the per-character gallery: getCharacterGallery reads image
//     messages regardless of their deletedAt, and purge-deleted-messages never
//     hard-deletes media rows;
//   - the rolling summary and the relationship counters (messageCount, score,
//     days active) are reset; lastMessageAt is re-stamped so the next reply
//     doesn't open with a "you've been away N days" line;
//   - long-term memory for the (user, character) pair — the memory-profiles
//     document and every memory-entries fact — is hard-deleted. The user asked
//     to be forgotten; keeping it would make the character recall a history the
//     user just erased.
//
// All of it runs as raw SQL in ONE transaction. It used to be a Payload bulk
// update, which updates each row separately and collects per-row failures in
// `errors` instead of throwing — a failed row silently stayed live, so a clear
// could leave stray messages behind while still answering ok.

export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { ensureGreeting } from '@/features/chat/ensure-greeting'
import { relId } from '@/features/memory/memory-job'
import { CHARACTER_COL, USER_COL } from '@/features/memory/retrieve-memories'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ route: '/api/chat/conversations/[id]/clear' })

const LOCALES = ['en', 'ru', 'es'] as const
type Locale = (typeof LOCALES)[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params
  if (!conversationId) {
    return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  }

  const payload = await getPayload({ config })

  const conversation = await payload
    .findByID({ collection: 'conversations', id: conversationId, depth: 0 })
    .catch(() => null)
  if (!conversation || conversation.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (String(relId(conversation.userId)) !== String(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const characterId = relId(conversation.characterId)

  const pool = (payload.db as unknown as PostgresAdapter).pool
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cleared = await client.query(
      `UPDATE messages SET deleted_at = now(), updated_at = now()
       WHERE conversation_id_id = $1 AND deleted_at IS NULL`,
      [conversation.id],
    )
    await client.query(
      `UPDATE conversations
       SET summary = NULL,
           summary_up_to_message_id_id = NULL,
           summary_updated_at = NULL,
           last_message_preview = NULL,
           message_count = 0,
           relationship_score = 0,
           days_active_count = 0,
           last_message_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [conversation.id],
    )
    let forgotten = 0
    if (characterId !== null) {
      const entries = await client.query(
        `DELETE FROM memory_entries WHERE ${USER_COL} = $1 AND ${CHARACTER_COL} = $2`,
        [user.id, characterId],
      )
      await client.query(
        `DELETE FROM memory_profiles WHERE ${USER_COL} = $1 AND ${CHARACTER_COL} = $2`,
        [user.id, characterId],
      )
      forgotten = entries.rowCount ?? 0
    }
    await client.query('COMMIT')

    log.info({
      msg: 'chat.conversation.cleared',
      conversationId: conversation.id,
      clearedMessages: cleared.rowCount ?? 0,
      forgottenMemories: forgotten,
    })
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {})
    log.error({
      msg: 'chat.conversation.clear_failed',
      conversationId: conversation.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'clear_failed' }, { status: 500 })
  } finally {
    client.release()
  }

  // The character speaks first, exactly as in a brand-new chat. Best-effort:
  // the clear already committed, and the chat page seeds the greeting on its
  // next load anyway if this fails.
  const locale = await readLocale(req, conversation.language)
  const character =
    characterId !== null
      ? await payload
          .findByID({ collection: 'characters', id: characterId, depth: 0, locale, overrideAccess: true })
          .catch(() => null)
      : null
  const greeting = await ensureGreeting(payload, {
    conversationId: conversation.id,
    character,
    fallbackName: (conversation.characterSnapshot as { name?: string } | null)?.name ?? 'Companion',
    locale,
  }).catch(() => null)

  return NextResponse.json({ ok: true, greeting })
}

async function readLocale(req: NextRequest, fallback: unknown): Promise<Locale> {
  const body = (await req.json().catch(() => null)) as { locale?: unknown } | null
  const pick = (v: unknown): Locale | null =>
    typeof v === 'string' && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null
  return pick(body?.locale) ?? pick(fallback) ?? 'en'
}
