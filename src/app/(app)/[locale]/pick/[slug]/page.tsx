import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentUser } from '@/shared/auth/current-user'
import { CharacterAuthPrompt, getCharacterBySlug } from '@/widgets/character-auth-prompt'

type Props = {
  params: Promise<{ locale: string; slug: string }>
}

export default async function PickCharacterPage({ params }: Props) {
  const { locale, slug } = await params

  const character = await getCharacterBySlug(slug, locale)
  if (!character) notFound()

  const chatHref = `/${locale}/chat/new?characterId=${character.id}`

  const user = await getCurrentUser()
  if (user) {
    redirect(chatHref)
  }

  const t = await getTranslations('pick')

  return (
    <CharacterAuthPrompt
      locale={locale}
      character={character}
      next={chatHref}
      strings={{
        eyebrow: t('eyebrow'),
        headline: t('headline'),
        subheadline: t('subheadline'),
        signUp: t('signUp'),
        signIn: t('signIn'),
        noAccount: t('noAccount'),
        back: t('back'),
      }}
    />
  )
}
