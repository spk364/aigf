import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCharacterGallery } from '@/features/media/character-gallery'
import { CharacterGallery } from '@/widgets/character-gallery/CharacterGallery'

type Props = {
  params: Promise<{ locale: string; conversationId: string }>
}

export default async function GalleryPage({ params }: Props) {
  const { locale, conversationId } = await params
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })
  const t = await getTranslations('gallery')

  const conversation = await payload
    .findByID({ collection: 'conversations', id: conversationId })
    .catch(() => null)
  if (!conversation || conversation.deletedAt) notFound()

  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId
  if (String(convUserId) !== String(user.id)) notFound()

  const characterId =
    typeof conversation.characterId === 'object' && conversation.characterId !== null
      ? (conversation.characterId as { id: string | number }).id
      : (conversation.characterId as string | number | undefined)
  if (!characterId) notFound()

  const snapshot = conversation.characterSnapshot as { name?: string } | null
  const characterName = snapshot?.name ?? 'Companion'

  const items = await getCharacterGallery({
    payload,
    userId: user.id,
    characterId,
  })

  const caption =
    items.length > 0
      ? t('countLabel', { n: items.length })
      : t('subtitle', { name: characterName })

  return (
    <CharacterGallery
      items={items}
      backHref={`/${locale}/chat/${conversationId}`}
      strings={{
        title: t('title', { name: characterName }),
        caption,
        backToChat: t('backToChat'),
        empty: t('empty'),
        emptyHint: t('emptyHint'),
        close: t('close'),
      }}
    />
  )
}
