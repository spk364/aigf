// End-to-end "clear history" against the real database: the real route, the
// real adapter, real rows. Works on a throwaway conversation owned by the seeded
// dev user (dev@local.test) and hard-deletes everything it created afterwards,
// so it is safe to run against the shared database.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getPayload, type BasePayload, type Where } from 'payload'
import config from '@payload-config'
import { NextRequest } from 'next/server'
import { getSqlPool } from '@/shared/db/sql-pool'
import { retrieveMemories, loadProfile } from '@/features/memory/retrieve-memories'

const currentUser = vi.hoisted(() => ({ value: null as { id: number } | null }))
vi.mock('@/shared/auth/current-user', () => ({
  getCurrentUser: async () => currentUser.value,
}))

import { POST } from '@/app/api/chat/conversations/[id]/clear/route'

const DEV_EMAIL = 'dev@local.test'

let payload: BasePayload
let userId: number
let characterId: number
let conversationId: number

beforeAll(async () => {
  payload = await getPayload({ config })

  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const user = users.docs[0]
  if (!user) throw new Error(`seed the dev user first (pnpm seed:dev): ${DEV_EMAIL} not found`)
  userId = Number(user.id)
  currentUser.value = { id: userId }

  // Any live character. Its greeting may come from the LLM (capped at 8s) or
  // the deterministic fallback — either way one greeting row gets seeded.
  const characters = await payload.find({
    collection: 'characters',
    where: { deletedAt: { exists: false } },
    locale: 'en',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const character = characters.docs[0]
  if (!character) throw new Error('no live character to chat with')
  characterId = Number(character.id)

  const conversation = await payload.create({
    collection: 'conversations',
    data: {
      userId,
      characterId,
      language: 'en',
      summary: 'integration-test summary',
      messageCount: 3,
      relationshipScore: 40,
      daysActiveCount: 5,
      lastMessageAt: new Date(Date.now() - 54 * 86_400_000).toISOString(),
    } as never,
    depth: 0,
    overrideAccess: true,
  })
  conversationId = Number(conversation.id)

  for (const [role, type, content] of [
    ['user', 'text', 'my name is Integration'],
    ['assistant', 'text', 'nice to meet you'],
    ['assistant', 'image', ''],
  ] as const) {
    await payload.create({
      collection: 'messages',
      data: { conversationId, role, type, content, status: 'completed' } as never,
      depth: 0,
      overrideAccess: true,
    })
  }
}, 120_000)

// Cleanup goes through Payload's own API, not getSqlPool — it must still run
// when the pool lookup is exactly what broke.
afterAll(async () => {
  if (!payload || !conversationId) return
  const pair: Where = {
    and: [{ userId: { equals: userId } }, { characterId: { equals: characterId } }],
  }
  await payload.delete({ collection: 'messages', where: { conversationId: { equals: conversationId } }, overrideAccess: true })
  await payload.delete({ collection: 'memory-entries', where: pair, overrideAccess: true })
  await payload.delete({ collection: 'memory-profiles', where: pair, overrideAccess: true })
  await payload.delete({ collection: 'conversations', id: conversationId, overrideAccess: true })
})

describe('POST /api/chat/conversations/[id]/clear (real DB)', () => {
  it('memory reads go through the real pool', async () => {
    // Guards against the pair already having real memory: the dev user must not
    // be someone's actual account.
    const pool = getSqlPool(payload)!
    const before = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM memory_entries WHERE user_id_id = $1 AND character_id_id = $2',
      [userId, characterId],
    )
    expect(Number(before.rows[0]?.n)).toBe(0)

    await payload.create({
      collection: 'memory-profiles',
      data: { userId, characterId, profile: 'About them:\n- name is Integration' } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'memory-entries',
      data: { userId, characterId, conversationId, category: 'personal_info', content: 'is called Integration', importance: 3 } as never,
      overrideAccess: true,
    })

    // No query text → the importance fallback, which still needs the pool.
    const memories = await retrieveMemories({ payload, userId, characterId, queryText: '' })
    expect(memories.map((m) => m.content)).toEqual(['is called Integration'])
  })

  it('wipes the thread and the memory, and re-greets', async () => {
    const req = new NextRequest(`http://localhost/api/chat/conversations/${conversationId}/clear`, {
      method: 'POST',
      body: JSON.stringify({ locale: 'en' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: String(conversationId) }) })
    const body = (await res.json()) as { ok?: boolean; greeting?: { id: string; content: string } | null }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.greeting?.content).toBeTruthy()

    const pool = getSqlPool(payload)!
    const live = await pool.query<{ id: number; role: string; type: string }>(
      'SELECT id, role, type FROM messages WHERE conversation_id_id = $1 AND deleted_at IS NULL',
      [conversationId],
    )
    // Only the fresh greeting is left — the photo message is cleared too.
    expect(live.rows).toHaveLength(1)
    expect(String(live.rows[0]!.id)).toBe(String(body.greeting!.id))

    const conv = await pool.query<Record<string, unknown>>(
      `SELECT summary, relationship_score, days_active_count, last_message_at
       FROM conversations WHERE id = $1`,
      [conversationId],
    )
    expect(conv.rows[0]!.summary).toBeNull()
    expect(Number(conv.rows[0]!.relationship_score)).toBe(0)
    expect(Number(conv.rows[0]!.days_active_count)).toBe(0)
    expect(Date.now() - new Date(String(conv.rows[0]!.last_message_at)).getTime()).toBeLessThan(60_000)

    expect(await loadProfile(payload, userId, characterId)).toBeNull()
    expect(await retrieveMemories({ payload, userId, characterId, queryText: '' })).toEqual([])
  })
})
