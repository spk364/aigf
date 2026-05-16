'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type ChatListItem = {
  id: string
  href: string
  name: string
  preview: string | null
  photoUrl?: string
  unread?: boolean
}

type Props = {
  item: ChatListItem
}

export function ConversationLink({ item }: Props) {
  const pathname = usePathname()
  const active = pathname?.includes(`/chat/${item.id}`) ?? false

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={
        'group relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200 ' +
        (active
          ? 'bg-[var(--color-accent-strong)]/15 ring-1 ring-[var(--color-accent-strong)]/30'
          : 'hover:bg-white/5 hover:ring-1 hover:ring-white/5')
      }
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--color-accent-strong)]"
        />
      )}
      <Avatar name={item.name} photoUrl={item.photoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={
              'truncate text-sm font-semibold ' +
              (active ? 'text-[var(--color-text)]' : 'text-[var(--color-text)]')
            }
          >
            {item.name}
          </p>
          {item.unread && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]"
            />
          )}
        </div>
        {item.preview && (
          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
            {item.preview}
          </p>
        )}
      </div>
    </Link>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  if (photoUrl) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
        />
      </div>
    )
  }
  return (
    <div
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-[var(--color-bg)]"
      style={{
        background: 'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
      />
    </div>
  )
}
