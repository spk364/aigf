import { Suspense } from 'react'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isPremiumPlan } from '@/features/billing/plans'
import { DashboardShell } from '@/widgets/dashboard/DashboardShell'
import { ChatListSidebar, ChatListSidebarSkeleton } from '@/widgets/chat-layout/ChatListSidebar'

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function ChatLayout({ children, params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()

  const displayName =
    (user as unknown as { displayName?: string }).displayName || user.email

  // Cheap parallel lookup for the sidebar profile block — runs alongside the
  // children, so it doesn't add a waterfall to the chat content render.
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
      active="chat"
    >
      {/* Heights:
          - mobile (< md): DashboardShell renders a sticky h-14 top bar above
            us, so we reserve viewport - 3.5rem here. dvh accounts for
            iOS URL-bar collapse so the composer stays reachable.
          - md+: no top bar, so we take the full viewport.
          `min-h-0` lets nested flex children scroll instead of stretching us. */}
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden overscroll-none md:h-[100dvh]">
        <aside
          aria-label="Conversations"
          className="hidden w-80 shrink-0 border-r border-[var(--color-border)] md:block"
        >
          <Suspense fallback={<ChatListSidebarSkeleton />}>
            <ChatListSidebar locale={locale} />
          </Suspense>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </DashboardShell>
  )
}
