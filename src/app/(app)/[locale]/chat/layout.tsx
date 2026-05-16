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
      {/* h-[calc(100dvh-3.5rem)] reserves space for DashboardShell's mobile h-14
          top bar; on md+ there is no such bar so we get the full viewport. */}
      <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden md:h-[100dvh]">
        <aside
          aria-label="Conversations"
          className="hidden w-80 shrink-0 border-r border-[var(--color-border)] md:flex"
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
