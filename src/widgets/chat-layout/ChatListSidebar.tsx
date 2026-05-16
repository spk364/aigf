import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { getTranslations } from 'next-intl/server'
import { ConversationLink, type ChatListItem } from './ConversationLink'

type Props = {
  locale: string
}

function extractCharacterId(rel: unknown): string | null {
  if (typeof rel === 'string' || typeof rel === 'number') return String(rel)
  if (rel && typeof rel === 'object' && 'id' in rel) {
    const idVal = (rel as { id: string | number }).id
    return String(idVal)
  }
  return null
}

function extractPrimaryPhoto(character: unknown): string | undefined {
  if (!character || typeof character !== 'object') return undefined
  const primary = (character as { primaryImageId?: unknown }).primaryImageId
  if (!primary || typeof primary !== 'object') return undefined
  const url = (primary as { publicUrl?: unknown }).publicUrl
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

// Server component — renders the chat list on the left of every /chat route.
// Streams in via Suspense from the chat layout so the rest of the shell can
// paint without waiting on the Payload query.
export async function ChatListSidebar({ locale }: Props) {
  const user = await getCurrentUser()
  if (!user) return null

  const payload = await getPayload({ config })
  const t = await getTranslations('chat')

  const conversationsResult = await payload.find({
    collection: 'conversations',
    where: {
      and: [
        { userId: { equals: user.id } },
        { status: { equals: 'active' } },
        { deletedAt: { equals: null } },
      ],
    },
    sort: '-lastMessageAt',
    limit: 30,
  })

  // Batch-load primary images for character avatars in one query.
  const characterIds = new Set<string>()
  for (const conv of conversationsResult.docs) {
    const id = extractCharacterId(conv.characterId)
    if (id) characterIds.add(id)
  }

  const photoMap = new Map<string, string>()
  if (characterIds.size > 0) {
    try {
      const charResult = await payload.find({
        collection: 'characters',
        where: { id: { in: Array.from(characterIds) } },
        depth: 1,
        limit: characterIds.size,
        overrideAccess: true,
      })
      for (const c of charResult.docs) {
        const url = extractPrimaryPhoto(c)
        if (url) photoMap.set(String(c.id), url)
      }
    } catch {
      // photos are non-critical
    }
  }

  const items: ChatListItem[] = conversationsResult.docs.map((conv) => {
    const snapshot = conv.characterSnapshot as { name?: string } | null
    const charId = extractCharacterId(conv.characterId)
    return {
      id: String(conv.id),
      href: `/${locale}/chat/${conv.id}`,
      name: snapshot?.name ?? 'Conversation',
      preview: (conv.lastMessagePreview as string | null) ?? null,
      photoUrl: charId ? photoMap.get(charId) : undefined,
    }
  })

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]/40 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          {t('yourConversations')}
        </h2>
        <Link
          href={`/${locale}/chat`}
          title={t('startNewChat')}
          aria-label={t('startNewChat')}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-[var(--color-accent-strong)] text-[var(--color-bg)] transition-transform duration-200 hover:scale-110 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {items.length === 0 ? (
          <EmptyState locale={locale} />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item, idx) => (
              <li
                key={item.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
              >
                <ConversationLink item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

async function EmptyState({ locale }: { locale: string }) {
  const t = await getTranslations('chat')
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 11-3.4-6.5L21 4l-1 4.5A8 8 0 0121 12z" />
        </svg>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{t('noConversationsYet')}</p>
      <Link
        href={`/${locale}/chat`}
        className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--color-accent-strong)] px-4 py-2 text-xs font-bold text-[var(--color-bg)] transition-transform duration-200 hover:scale-105 hover:bg-[var(--color-accent)]"
      >
        {t('startNewChat')}
      </Link>
    </div>
  )
}

export function ChatListSidebarSkeleton() {
  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]/40 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--color-surface-2)]" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-[var(--color-surface-2)]/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
