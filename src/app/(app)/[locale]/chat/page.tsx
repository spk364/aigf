import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { sortAndDedupeConversations } from '@/features/chat/conversation-list'
import Link from 'next/link'

type Props = {
  params: Promise<{ locale: string }>
}

function CharacterInitial({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase()
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-[var(--color-bg)]"
      style={{
        background: 'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
      }}
      aria-hidden
    >
      {letter}
    </div>
  )
}

function CharacterAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (!photoUrl) return <CharacterInitial name={name} />
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
    </div>
  )
}

function CharacterCover({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (!photoUrl) {
    return (
      <div
        className="mb-4 flex aspect-[3/4] w-full items-center justify-center rounded-xl text-4xl font-bold text-[var(--color-bg)]"
        style={{
          background:
            'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
        }}
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    <div className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
    </div>
  )
}

function getPrimaryPhotoUrl(character: unknown): string | undefined {
  if (!character || typeof character !== 'object') return undefined
  const primary = (character as { primaryImageId?: unknown }).primaryImageId
  if (!primary || typeof primary !== 'object') return undefined
  const url = (primary as { publicUrl?: unknown }).publicUrl
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

export default async function ChatPage({ params }: Props) {
  const { locale } = await params
  const user = await requireCompleteProfile()
  const t = await getTranslations('chat')
  const payload = await getPayload({ config })

  const charactersResult = await payload.find({
    collection: 'characters',
    locale: locale as 'en' | 'ru' | 'es',
    where: {
      and: [
        { kind: { equals: 'preset' } },
        { isPublished: { equals: true } },
        { deletedAt: { equals: null } },
      ],
    },
    sort: ['landingOrder', 'displayOrder'],
    depth: 1,
    limit: 20,
  })

  // Mobile-only: render the conversations list inline (no sidebar on mobile).
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
    // Over-fetch (NULL-lastMessageAt threads sort first in Postgres); re-sort +
    // dedupe in JS below.
    limit: 40,
  })

  // Restore true recency order (lastMessageAt ?? createdAt) and collapse legacy
  // duplicate threads per character down to one entry, then cap the display.
  const conversations = sortAndDedupeConversations(conversationsResult.docs, (conv) => {
    const cid = conv.characterId
    if (typeof cid === 'string' || typeof cid === 'number') return String(cid)
    if (cid && typeof cid === 'object' && 'id' in cid) return String((cid as { id: string | number }).id)
    return null
  }).slice(0, 20)

  const conversationCharacterIds = new Set<string>()
  for (const conv of conversations) {
    const cid = conv.characterId
    if (typeof cid === 'string' || typeof cid === 'number') {
      conversationCharacterIds.add(String(cid))
    } else if (cid && typeof cid === 'object' && 'id' in cid) {
      conversationCharacterIds.add(String((cid as { id: string | number }).id))
    }
  }

  const conversationCharacterPhotos = new Map<string, string>()
  if (conversationCharacterIds.size > 0) {
    try {
      const convCharsResult = await payload.find({
        collection: 'characters',
        where: { id: { in: Array.from(conversationCharacterIds) } },
        depth: 1,
        limit: conversationCharacterIds.size,
        overrideAccess: true,
      })
      for (const c of convCharsResult.docs) {
        const url = getPrimaryPhotoUrl(c)
        if (url) conversationCharacterPhotos.set(String(c.id), url)
      }
    } catch {
      // photos non-critical
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('startNewChat')}</p>
          </div>
          <Link
            href={`/${locale}/builder`}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-all duration-200 hover:scale-[1.02] hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
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
            {t('createOwn')}
          </Link>
        </div>

        {/* Mobile-only: conversations list. Desktop has the sidebar instead. */}
        {conversations.length > 0 && (
          <section className="mb-10 md:hidden">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {t('yourConversations')}
            </h2>
            <div className="flex flex-col gap-2">
              {conversations.map((conv, idx) => {
                const snapshot = conv.characterSnapshot as { name?: string } | null
                const name = snapshot?.name ?? 'Conversation'
                const cid = conv.characterId
                const cidStr =
                  typeof cid === 'string' || typeof cid === 'number'
                    ? String(cid)
                    : cid && typeof cid === 'object' && 'id' in cid
                      ? String((cid as { id: string | number }).id)
                      : null
                const photoUrl = cidStr ? conversationCharacterPhotos.get(cidStr) : undefined
                return (
                  <Link
                    key={String(conv.id)}
                    href={`/${locale}/chat/${conv.id}`}
                    style={{ animationDelay: `${Math.min(idx * 40, 240)}ms` }}
                    className="group flex animate-fade-in-up cursor-pointer items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 transition-all duration-200 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)] active:scale-[0.99]"
                  >
                    <CharacterAvatar name={name} photoUrl={photoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[var(--color-text)]">{name}</div>
                      {conv.lastMessagePreview && (
                        <div className="truncate text-sm text-[var(--color-text-muted)]">
                          {conv.lastMessagePreview}
                        </div>
                      )}
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="ml-auto h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('startNewChat')}
          </h2>
          {charactersResult.docs.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('noCharactersYet')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {charactersResult.docs.map((char, idx) => {
                const photoUrl = getPrimaryPhotoUrl(char)
                return (
                  <Link
                    key={String(char.id)}
                    href={`/${locale}/chat/new?characterId=${char.id}`}
                    style={{ animationDelay: `${Math.min(idx * 35, 280)}ms` }}
                    className="group flex animate-fade-in-up cursor-pointer flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-accent-strong)]/50 hover:bg-[var(--color-surface-2)] hover:shadow-xl hover:shadow-[var(--color-accent-strong)]/10"
                  >
                    <CharacterCover name={char.name} photoUrl={photoUrl} />

                    <div className="font-semibold text-[var(--color-text)]">{char.name}</div>
                    {char.tagline && (
                      <div className="mt-1 text-sm text-[var(--color-text-muted)] line-clamp-2">
                        {char.tagline}
                      </div>
                    )}
                    {char.artStyle && (
                      <span className="mt-3 self-start rounded-full bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                        {char.artStyle}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
