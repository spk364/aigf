import { redirect } from 'next/navigation'
import { getMessages } from 'next-intl/server'
import { GuestBuilderWizard } from '@/widgets/character-builder/GuestBuilderWizard'
import { getCurrentUser } from '@/shared/auth/current-user'
import { readGuestDraft } from '@/features/builder/guest-cookie'

export const maxDuration = 60

type Props = {
  params: Promise<{ locale: string }>
}

export default async function TryBuilderPage({ params }: Props) {
  const { locale } = await params

  // Authenticated users skip the teaser flow.
  const user = await getCurrentUser()
  if (user) {
    redirect(`/${locale}/builder`)
  }

  const messages = await getMessages()
  const guestDraft = await readGuestDraft()

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <GuestBuilderWizard
        locale={locale as 'en' | 'ru' | 'es'}
        initialAppearance={guestDraft?.appearance ?? {}}
        initialPreviews={guestDraft?.previews ?? []}
        initialSelectedMediaAssetId={guestDraft?.selectedMediaAssetId ?? null}
        strings={messages as Record<string, unknown>}
      />
    </main>
  )
}
