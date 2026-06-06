import { redirect } from 'next/navigation'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { findExistingConversation } from '@/features/chat/find-existing-conversation'

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

  // One thread per (user, character): if the user already has a conversation
  // with this companion, re-open it instead of spawning a duplicate (and a
  // duplicate greeting). All discovery / card entry points funnel through this
  // page, so this is the single gate that keeps "your conversations" unique.
  const existing = await findExistingConversation(payload, user.id, characterId)
  if (existing) {
    redirect(`/${locale}/chat/${existing.id}`)
  }

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

  // Resolve greeting in this locale; lazy-fill if missing (older preset
  // characters seeded before this feature). Failure leaves greetingMessage
  // null and the chat opens empty — same behaviour as before this change.
  let greetingText: string | null =
    typeof character.greetingMessage === 'string' && character.greetingMessage.length > 0
      ? character.greetingMessage
      : null

  if (!greetingText) {
    try {
      const { generateGreetingMessage } = await import('@/features/chat/generate-greeting')
      const result = await generateGreetingMessage({
        character: {
          name: typeof character.name === 'string' ? character.name : 'Companion',
          systemPrompt: typeof character.systemPrompt === 'string' ? character.systemPrompt : null,
          shortBio: typeof character.shortBio === 'string' ? character.shortBio : null,
          archetype: typeof character.archetype === 'string' ? character.archetype : null,
          backstory: (character.backstory as Record<string, unknown>) ?? null,
          personalityTraits: (character.personalityTraits as Record<string, unknown>) ?? null,
          communicationStyle: (character.communicationStyle as Record<string, unknown>) ?? null,
        },
        locale: locale as Locale,
      })
      greetingText = result.text
      // Cache for future users in the same locale. Localized field — the
      // update only writes the row for the active locale.
      await payload.update({
        collection: 'characters',
        id: character.id,
        locale: locale as Locale,
        data: { greetingMessage: greetingText },
        overrideAccess: true,
      })
    } catch (err) {
      console.warn('chat/new: greeting generation failed', err)
    }
  }

  // Create the conversation. Mirrors the snapshot block in /api/chat so the
  // first user reply has full persona context to work from.
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
    },
    overrideAccess: true,
  })

  if (greetingText) {
    await payload.create({
      collection: 'messages',
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        type: 'text',
        status: 'completed',
        content: greetingText,
      },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'conversations',
      id: conversation.id,
      data: { messageCount: 1, lastMessagePreview: greetingText.slice(0, 120) },
      overrideAccess: true,
    })
  }

  redirect(`/${locale}/chat/${conversation.id}`)
}
