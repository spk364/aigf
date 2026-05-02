import 'server-only'
import { getPayload } from 'payload'
import config from '@payload-config'

export type CompanionCard = {
  id: string
  name: string
  archetype: string | null
  artStyle: string | null
  primaryImageUrl: string | null
  lastMessageAt: string | null
  conversationId: string | null
}

export type RecentConversationRow = {
  id: string
  characterId: string | null
  characterName: string
  characterImageUrl: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
}

export type DraftRow = {
  id: string
  name: string
  step: number
  thumbnailUrl: string | null
}

function relId(rel: unknown): string | null {
  if (rel == null) return null
  if (typeof rel === 'object') {
    const obj = rel as { id?: string | number }
    return obj.id != null ? String(obj.id) : null
  }
  return String(rel)
}

function relPublicUrl(rel: unknown): string | null {
  if (rel == null || typeof rel !== 'object') return null
  const obj = rel as { publicUrl?: string }
  return typeof obj.publicUrl === 'string' ? obj.publicUrl : null
}

export async function getDashboardData(opts: {
  userId: string | number
  locale: 'en' | 'ru' | 'es'
}): Promise<{
  companions: CompanionCard[]
  recentConversations: RecentConversationRow[]
  drafts: DraftRow[]
  hero: {
    conversationId: string
    characterName: string
    characterImageUrl: string | null
    lastMessagePreview: string | null
    lastMessageAt: string | null
  } | null
}> {
  const payload = await getPayload({ config })
  const now = new Date().toISOString()

  // 1) Custom characters created by this user.
  const charactersPromise = payload.find({
    collection: 'characters',
    locale: opts.locale,
    where: {
      and: [
        { kind: { equals: 'custom' } },
        { createdBy: { equals: opts.userId } },
        { deletedAt: { equals: null } },
      ],
    },
    sort: '-createdAt',
    limit: 24,
    depth: 1,
    overrideAccess: true,
  })

  // 2) Recent conversations.
  const conversationsPromise = payload.find({
    collection: 'conversations',
    where: {
      and: [
        { userId: { equals: opts.userId } },
        { status: { equals: 'active' } },
        { deletedAt: { equals: null } },
      ],
    },
    sort: '-lastMessageAt',
    limit: 8,
    depth: 1,
    overrideAccess: true,
  })

  // 3) Open drafts (not deleted, not expired).
  const draftsPromise = payload.find({
    collection: 'character-drafts',
    where: {
      and: [
        { userId: { equals: opts.userId } },
        { deletedAt: { exists: false } },
        { expiresAt: { greater_than: now } },
      ],
    },
    sort: '-updatedAt',
    limit: 5,
    overrideAccess: true,
  })

  const [charactersResult, conversationsResult, draftsResult] = await Promise.all([
    charactersPromise,
    conversationsPromise,
    draftsPromise,
  ])

  // Index conversations by characterId for "last activity" + jump-into-chat on companion cards.
  const conversationByCharacter = new Map<
    string,
    { id: string; lastMessageAt: string | null }
  >()
  for (const conv of conversationsResult.docs) {
    const charId = relId(conv.characterId)
    if (!charId) continue
    if (conversationByCharacter.has(charId)) continue
    conversationByCharacter.set(charId, {
      id: String(conv.id),
      lastMessageAt:
        typeof conv.lastMessageAt === 'string' ? conv.lastMessageAt : null,
    })
  }

  const companions: CompanionCard[] = charactersResult.docs.map((doc) => {
    const id = String(doc.id)
    const conv = conversationByCharacter.get(id) ?? null
    return {
      id,
      name: typeof doc.name === 'string' ? doc.name : 'Untitled',
      archetype: typeof doc.archetype === 'string' ? doc.archetype : null,
      artStyle: typeof doc.artStyle === 'string' ? doc.artStyle : null,
      primaryImageUrl: relPublicUrl(doc.primaryImageId),
      lastMessageAt: conv?.lastMessageAt ?? null,
      conversationId: conv?.id ?? null,
    }
  })

  const recentConversations: RecentConversationRow[] = conversationsResult.docs
    .slice(0, 6)
    .map((conv) => {
      const character = conv.characterId as
        | { id?: string | number; name?: string; primaryImageId?: unknown }
        | string
        | number
        | null
      let characterName = 'Conversation'
      let characterImageUrl: string | null = null
      let characterId: string | null = null
      if (character && typeof character === 'object') {
        characterName =
          typeof character.name === 'string' && character.name.length > 0
            ? character.name
            : characterName
        characterImageUrl = relPublicUrl(
          (character as { primaryImageId?: unknown }).primaryImageId,
        )
        if (character.id != null) characterId = String(character.id)
      }
      // Fallback to snapshot name if relationship didn't populate the localized name.
      if (characterName === 'Conversation') {
        const snapshot = conv.characterSnapshot as { name?: string } | null
        if (snapshot?.name) characterName = snapshot.name
      }
      return {
        id: String(conv.id),
        characterId,
        characterName,
        characterImageUrl,
        lastMessagePreview:
          typeof conv.lastMessagePreview === 'string' ? conv.lastMessagePreview : null,
        lastMessageAt:
          typeof conv.lastMessageAt === 'string' ? conv.lastMessageAt : null,
      }
    })

  const drafts: DraftRow[] = draftsResult.docs.map((draft) => {
    const data = (draft.data ?? {}) as Record<string, unknown>
    const identity = (data.identity ?? {}) as Record<string, unknown>
    const previewGenerations = Array.isArray(draft.previewGenerations)
      ? (draft.previewGenerations as Array<{
          mediaAssetId?: string
          publicUrl?: string
          selectedAsReference?: boolean
        }>)
      : []
    const selected = previewGenerations.find((p) => p.selectedAsReference)
    const fallback = previewGenerations[0]
    const thumbnailUrl =
      selected?.publicUrl ?? fallback?.publicUrl ?? null
    const draftName =
      typeof identity.name === 'string' && identity.name.length > 0
        ? identity.name
        : 'Untitled draft'
    return {
      id: String(draft.id),
      name: draftName,
      step: typeof draft.currentStep === 'number' ? draft.currentStep : 1,
      thumbnailUrl,
    }
  })

  // Hero = top recent conversation (if any).
  const hero = recentConversations[0]
    ? {
        conversationId: recentConversations[0].id,
        characterName: recentConversations[0].characterName,
        characterImageUrl: recentConversations[0].characterImageUrl,
        lastMessagePreview: recentConversations[0].lastMessagePreview,
        lastMessageAt: recentConversations[0].lastMessageAt,
      }
    : null

  return { companions, recentConversations, drafts, hero }
}
