import Link from 'next/link'
import type { RecentConversationRow } from '@/features/dashboard/queries'
import { timeAgo } from './timeAgo'

type Props = {
  locale: string
  rows: RecentConversationRow[]
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-12 w-12 shrink-0 rounded-2xl object-cover"
      />
    )
  }
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-[var(--color-bg)]"
      style={{
        background: 'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function RecentConversations({ locale, rows }: Props) {
  if (rows.length === 0) return null
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Recent</h2>
        <Link
          href={`/${locale}/chat`}
          className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="flex flex-col divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {rows.map((r) => {
          const ago = timeAgo(r.lastMessageAt)
          return (
            <Link
              key={r.id}
              href={`/${locale}/chat/${r.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <Avatar name={r.characterName} url={r.characterImageUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-[var(--color-text)]">
                    {r.characterName}
                  </span>
                  {ago && (
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                      {ago}
                    </span>
                  )}
                </div>
                {r.lastMessagePreview && (
                  <p className="mt-0.5 truncate text-sm text-[var(--color-text-muted)]">
                    {r.lastMessagePreview}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
