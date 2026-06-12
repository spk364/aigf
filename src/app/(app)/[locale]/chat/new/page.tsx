import { redirect } from 'next/navigation'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { findExistingConversation } from '@/features/chat/find-existing-conversation'
import { ensureGreeting } from '@/features/chat/ensure-greeting'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ characterId?: string }>
}

type Locale = 'en' | 'ru' | 'es'

// Server-creates a conversation pre-seeded with the character's greeting
// message, then redirects to /chat/[id]. This makes the character "speak
// first" without a roundtrip through the chat API — by the time the user
// sees the chat, the opening bubble is already in messages.
export default async function NewChatPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { characterId } = await searchParams
  const user = await requireCompleteProfile()
  const t = await getTranslations('chat')

  if (!characterId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        <p>{t('errorGeneric')}</p>
      </div>
    )
  }

  const payload = await getPayload({ config })

  let character
  try {
    character = await payload.findByID({
      collection: 'characters',
      id: characterId,
      locale: locale as Locale,
      depth: 1,
      overrideAccess: true,
    })
  } catch {
    character = null
  }
  if (!character || character.deletedAt) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        <p>{t('errorGeneric')}</p>
      </div>
    )
  }

  const charName = typeof character.name === 'string' ? character.name : 'Companion'

  // One thread per (user, character). Resolve any existing thread up front: if
  // it already has messages, re-open it immediately. An empty existing thread
  // (greeting failed before, or created via the API first-message path which
  // never greets) gets greeted by ensureGreeting below — the old code redirected
  // to it unconditionally, which is how an ungreeted conversation stayed silent.
  const existing = await findExistingConversation(payload, user.id, characterId)
  let conversationId: string | number
  if (existing) {
    const existingMsgs = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { conversationId: { equals: existing.id } },
          { role: { in: ['user', 'assistant'] } },
          { deletedAt: { exists: false } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existingMsgs.totalDocs > 0) {
      redirect(`/${locale}/chat/${existing.id}`)
    }
    conversationId = existing.id
  } else {
    // Create the conversation. Mirrors the snapshot block in /api/chat so the
    // first user reply has full persona context to work from. lastMessageAt is
    // stamped at creation so the thread never carries a NULL that would float it
    // to the top of the chat list (Postgres NULLS-FIRST DESC ordering).
    const conversation = await payload.create({
      collection: 'conversations',
      data: {
        userId: user.id,
        characterId: character.id,
        characterSnapshot: {
          systemPrompt: character.systemPrompt,
          name: character.name,
          personalityTraits: character.personalityTraits,
          backstory: character.backstory,
          appearance: character.appearance ?? null,
          imageModel: character.imageModel ?? null,
        },
        snapshotVersion: (character.systemPromptVersion as number | undefined) ?? 1,
        language: locale,
        status: 'active',
        lastMessageAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    conversationId = conversation.id
  }

  // Seed the character's opening message so it "speaks first". Resolves a cached
  // greeting, generates+caches one (timeout-capped), or falls back to a static
  // per-locale line — the chat never opens blank.
  await ensureGreeting(payload, {
    conversationId,
    character,
    fallbackName: charName,
    locale: locale as Locale,
  })

  redirect(`/${locale}/chat/${conversationId}`)
}
