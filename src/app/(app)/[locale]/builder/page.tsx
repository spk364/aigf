import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { Card } from '@/shared/ui'
import { createDraftAction } from '@/features/builder/actions'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function BuilderPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('builder')
  const payload = await getPayload({ config })

  const now = new Date().toISOString()

  const draftsResult = await payload.find({
    collection: 'character-drafts',
    where: {
      and: [
        { userId: { equals: user.id } },
        { deletedAt: { exists: false } },
        { expiresAt: { greater_than: now } },
      ],
    },
    sort: '-updatedAt',
    limit: 20,
    overrideAccess: true,
  })

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [
        { userId: { equals: user.id } },
        { status: { equals: 'active' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const sub = subResult.docs[0]
  const isPremium =
    sub &&
    (sub.plan === 'premium_monthly' ||
      sub.plan === 'premium_yearly' ||
      sub.plan === 'premium_plus_monthly')

  const customCharsResult = await payload.find({
    collection: 'characters',
    where: {
      and: [
        { kind: { equals: 'custom' } },
        { createdBy: { equals: user.id } },
        { deletedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const atFreeLimit = !isPremium && customCharsResult.totalDocs >= 1

  async function startDraftEn() {
    'use server'
    await createDraftAction(locale as 'en' | 'ru' | 'es')
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">{t('title')}</h1>

        {atFreeLimit ? (
          <div className="mb-8 rounded-xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-strong)]/10 px-5 py-4 text-sm text-[var(--color-text)]">
            {t('upgradeRequired')}{' '}
            <Link href={`/${locale}/upgrade`} className="underline text-[var(--color-accent-strong)]">
              {t('upgradeLink')}
            </Link>
          </div>
        ) : (
          <form action={startDraftEn} className="mb-8">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-7 py-3.5 text-base font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
            >
              {t('startNew')}
            </button>
          </form>
        )}

        {draftsResult.docs.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-muted)] mb-4">{t('draftsHeading')}</h2>
            <div className="flex flex-col gap-3">
              {draftsResult.docs.map((draft) => {
                const draftData = (draft.data ?? {}) as Record<string, unknown>
                const identity = (draftData.identity ?? {}) as Record<string, unknown>
                const draftName = String(identity.name ?? '')
                const step = (draft.currentStep as number) ?? 1
                return (
                  <Card key={String(draft.id)} className="flex items-center justify-between gap-4 py-4 px-5">
                    <div>
                      <p className="font-medium text-[var(--color-text)]">
                        {draftName || `Draft #${String(draft.id).slice(-6)}`}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Step {step} / 4
                      </p>
                    </div>
                    <Link
                      href={`/${locale}/builder/${draft.id}`}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]"
                    >
                      Continue
                    </Link>
                  </Card>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
