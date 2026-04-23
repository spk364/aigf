import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import CancelConfirm from './cancel-confirm'
import { track } from '@/shared/analytics/posthog'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function BillingManagePage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('billing.manage')

  const payload = await getPayload({ config })

  const subResult = await payload.find({
    collection: 'subscriptions',
    where: { userId: { equals: user.id } },
    limit: 1,
    overrideAccess: true,
  })

  const sub = subResult.docs[0] ?? null

  async function cancelSubscriptionAction() {
    'use server'
    // TODO(prod): Wire real CCBill DataLink API cancel call here.
    // In sandbox we just update the local subscription row.

    const pl = await getPayload({ config })

    if (!sub) return

    const now = new Date().toISOString()

    await pl.update({
      collection: 'subscriptions',
      id: sub.id as string,
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: now,
      },
      overrideAccess: true,
    })

    const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd as string) : null
    const daysRemainingInPeriod = periodEnd
      ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86400000))
      : 0

    track({
      userId: String(user.id),
      event: 'subscription.canceled',
      properties: {
        plan: String(sub.plan),
        daysRemainingInPeriod,
      },
    })

    await pl.create({
      collection: 'audit-logs',
      data: {
        actorType: 'user',
        actorId: String(user.id),
        action: 'subscription.cancel',
        entityType: 'subscriptions',
        entityId: String(sub.id),
        changes: { cancelAtPeriodEnd: true, canceledAt: now },
        reason: 'User requested cancellation via manage page',
      },
      overrideAccess: true,
    })

    redirect(`/${locale}/billing/manage?canceled=1`)
  }

  const renewalDate = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd as string).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-16">
      <div className="mx-auto max-w-lg">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          Billing
        </p>
        <h1 className="mb-6 text-3xl font-bold text-[var(--color-text)]">{t('title')}</h1>

        {!sub ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="text-[var(--color-text-muted)]">
              You do not have an active subscription.
            </p>
            <a
              href={`/${locale}/upgrade`}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
            >
              View plans
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-[var(--color-border)] pb-4">
                <dt className="text-[var(--color-text-muted)]">{t('currentPlan')}</dt>
                <dd className="font-semibold capitalize text-[var(--color-text)]">
                  {String(sub.plan).replace(/_/g, ' ')}
                </dd>
              </div>
              <div className="flex justify-between border-b border-[var(--color-border)] pb-4">
                <dt className="text-[var(--color-text-muted)]">Status</dt>
                <dd className="font-semibold capitalize text-[var(--color-success)]">
                  {String(sub.status)}
                </dd>
              </div>
              {renewalDate && (
                <div className="flex justify-between border-b border-[var(--color-border)] pb-4">
                  <dt className="text-[var(--color-text-muted)]">{t('nextRenewal')}</dt>
                  <dd className="text-[var(--color-text)]">{renewalDate}</dd>
                </div>
              )}
              {sub.cancelAtPeriodEnd && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  {t('cancelAtPeriodEnd')}
                </div>
              )}
            </dl>

            {!sub.cancelAtPeriodEnd && (
              <div className="mt-6 border-t border-[var(--color-border)] pt-6">
                <CancelConfirm cancelAction={cancelSubscriptionAction} t={t} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
