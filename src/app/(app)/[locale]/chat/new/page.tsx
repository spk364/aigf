import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { ChatInterface } from '@/widgets/chat-interface/ChatInterface'
import { getTranslations } from 'next-intl/server'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ characterId?: string }>
}

export default async function NewChatPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { characterId } = await searchParams
  await requireCompleteProfile()
  const t = await getTranslations('chat')

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      <ChatInterface
        initialCharacterId={characterId}
        initialMessages={[]}
        locale={locale}
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
        }}
      />
    </div>
  )
}
