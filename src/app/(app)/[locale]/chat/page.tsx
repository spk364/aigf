import { getTranslations } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
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
    limit: 20,
  })

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
    limit: 20,
  })

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text)]">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-bold text-[var(--color-text)]">{t('title')}</h1>

        {/* Your conversations */}
        {conversationsResult.docs.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {t('yourConversations')}
            </h2>
            <div className="flex flex-col gap-2">
              {conversationsResult.docs.map((conv) => {
                const snapshot = conv.characterSnapshot as { name?: string } | null
                const name = snapshot?.name ?? 'Conversation'
                return (
                  <Link
                    key={String(conv.id)}
                    href={`/${locale}/chat/${conv.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 transition-colors hover:border-[var(--color-accent-strong)]/30 hover:bg-[var(--color-surface-2)]"
                  >
                    <CharacterInitial name={name} />
                    <div className="min-w-0">
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
                      className="ml-auto h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
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

        {/* Meet someone new */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('startNewChat')}
          </h2>
          {charactersResult.docs.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('noCharactersYet')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {charactersResult.docs.map((char) => (
                <Link
                  key={String(char.id)}
                  href={`/${locale}/chat/new?characterId=${char.id}`}
                  className="group flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--color-accent-strong)]/5"
                >
                  {/* Cover placeholder — gradient + letter */}
                  <div
                    className="mb-4 flex h-24 w-full items-center justify-center rounded-xl text-4xl font-bold text-[var(--color-bg)]"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
                    }}
                    aria-hidden
                  >
                    {char.name.charAt(0).toUpperCase()}
                  </div>

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
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
