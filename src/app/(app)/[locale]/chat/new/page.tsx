import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { ChatInterface } from '@/widgets/chat-interface/ChatInterface'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ characterId?: string }>
}

async function loadCharacterMeta(
  characterId: string | undefined,
  locale: string,
): Promise<{ name?: string; photoUrl?: string }> {
  if (!characterId) return {}
  try {
    const payload = await getPayload({ config })
    const character = await payload.findByID({
      collection: 'characters',
      id: characterId,
      locale: locale as 'en' | 'ru' | 'es',
      depth: 1,
      overrideAccess: true,
    })
    if (!character || character.deletedAt) return {}
    const primary = character.primaryImageId as unknown
    const photoUrl =
      primary && typeof primary === 'object'
        ? (primary as { publicUrl?: unknown }).publicUrl
        : undefined
    return {
      name: typeof character.name === 'string' ? character.name : undefined,
      photoUrl: typeof photoUrl === 'string' && photoUrl.length > 0 ? photoUrl : undefined,
    }
  } catch {
    return {}
  }
}

export default async function NewChatPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { characterId } = await searchParams
  await requireCompleteProfile()
  const t = await getTranslations('chat')

  const meta = await loadCharacterMeta(characterId, locale)

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      <ChatInterface
        initialCharacterId={characterId}
        initialMessages={[]}
        locale={locale}
        characterName={meta.name}
        characterPhotoUrl={meta.photoUrl}
        strings={{
          typing: t('typing'),
          regenerate: t('regenerate'),
          copy: t('copy'),
          copied: 'Copied',
          inputPlaceholder: t('inputPlaceholder'),
          send: t('send'),
          errorGeneric: t('errorGeneric'),
          errorQuota: t('errorQuota'),
          upgradeCta: t('upgradeCta'),
          backToChats: t('backToChats'),
          backToHome: t('backToHome'),
          dashboard: t('dashboard'),
          imagePending: t('imagePending'),
          imageQueuePosition: t('imageQueuePosition'),
          imageFailed: t('imageFailed'),
        }}
      />
    </div>
  )
}
