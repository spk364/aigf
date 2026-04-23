import { notFound, redirect } from 'next/navigation'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getMessages } from 'next-intl/server'
import { CharacterBuilderWizard } from '@/widgets/character-builder/CharacterBuilderWizard'

type Props = {
  params: Promise<{ locale: string; draftId: string }>
}

export default async function BuilderDraftPage({ params }: Props) {
  const { locale, draftId } = await params
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })

  const draft = await payload.findByID({
    collection: 'character-drafts',
    id: draftId,
    overrideAccess: true,
  })

  if (!draft) notFound()

  const draftUserId =
    typeof draft.userId === 'object' && draft.userId !== null
      ? (draft.userId as { id: string | number }).id
      : draft.userId

  if (String(draftUserId) !== String(user.id)) notFound()

  if (draft.deletedAt) redirect(`/${locale}/builder`)

  const messages = await getMessages()

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <CharacterBuilderWizard
        draftId={String(draft.id)}
        initialDraft={{
          id: String(draft.id),
          currentStep: (draft.currentStep as number) ?? 1,
          data: (draft.data ?? {}) as Record<string, unknown>,
          previewGenerations: (Array.isArray(draft.previewGenerations) ? draft.previewGenerations : []) as Array<Record<string, unknown>>,
          language: String(draft.language ?? locale) as 'en' | 'ru' | 'es',
        }}
        locale={locale as 'en' | 'ru' | 'es'}
        strings={messages as Record<string, unknown>}
      />
    </main>
  )
}
