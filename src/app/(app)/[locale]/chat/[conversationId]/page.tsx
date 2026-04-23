import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { notFound } from 'next/navigation'
import { ChatInterface } from '@/widgets/chat-interface/ChatInterface'
import { getTranslations } from 'next-intl/server'

type Props = {
  params: Promise<{ locale: string; conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { locale, conversationId } = await params
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })
  const t = await getTranslations('chat')

  const conversation = await payload.findByID({ collection: 'conversations', id: conversationId }).catch(() => null)
  if (!conversation) notFound()

  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId

  if (String(convUserId) !== String(user.id)) notFound()

  const messagesResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
      ],
    },
    sort: 'createdAt',
    limit: 30,
  })

  const snapshot = conversation.characterSnapshot as { name?: string } | null

  const initialMessages = messagesResult.docs.map((msg) => ({
    id: String(msg.id),
    role: msg.role as 'user' | 'assistant',
    content: msg.content ?? '',
  }))

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      <ChatInterface
        initialConversationId={conversationId}
        initialMessages={initialMessages}
        locale={locale}
        characterName={snapshot?.name ?? 'Anna'}
        strings={{
          typing: t('typing'),
          regenerate: t('regenerate'),
          copy: t('copy'),
          copied: 'Copied',
          inputPlaceholder: t('inputPlaceholder'),
          send: t('send'),
          errorGeneric: t('errorGeneric'),
          errorQuota: t('errorQuota'),
        }}
      />
    </div>
  )
}
