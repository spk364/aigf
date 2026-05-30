import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isPremiumPlan } from '@/features/billing/plans'
import { DashboardShell } from '@/widgets/dashboard/DashboardShell'

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function SettingsLayout({ children, params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()

  const displayName = (user as unknown as { displayName?: string }).displayName || user.email

  const payload = await getPayload({ config })
  const subResult = await payload.find({
    collection: 'subscriptions',
    where: {
      and: [{ userId: { equals: user.id } }, { status: { equals: 'active' } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  const isPremium = !!subResult.docs[0] && isPremiumPlan(subResult.docs[0].plan as string | null)

  return (
    <DashboardShell
      locale={locale}
      displayName={displayName}
      email={user.email}
      isPremium={isPremium}
      active="settings"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </DashboardShell>
  )
}
