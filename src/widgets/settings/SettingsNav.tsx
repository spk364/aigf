import Link from 'next/link'

export type SettingsTab = 'profile' | 'content' | 'account'

export type SettingsNavStrings = {
  profile: string
  content: string
  account: string
  heading: string
}

type Props = {
  locale: string
  active: SettingsTab
  strings: SettingsNavStrings
}

const TABS: { key: SettingsTab; icon: React.ReactNode }[] = [
  {
    key: 'profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
        <circle cx="12" cy="8" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    key: 'content',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
      </svg>
    ),
  },
  {
    key: 'account',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.6a1 1 0 0 1 3.4 0l.2.9a7 7 0 0 1 1.8 1l.9-.3a1 1 0 0 1 1.2.5l1 1.7a1 1 0 0 1-.3 1.3l-.7.6a7 7 0 0 1 0 2l.7.6a1 1 0 0 1 .3 1.3l-1 1.7a1 1 0 0 1-1.2.5l-.9-.3a7 7 0 0 1-1.8 1l-.2.9a1 1 0 0 1-3.4 0l-.2-.9a7 7 0 0 1-1.8-1l-.9.3a1 1 0 0 1-1.2-.5l-1-1.7a1 1 0 0 1 .3-1.3l.7-.6a7 7 0 0 1 0-2l-.7-.6a1 1 0 0 1-.3-1.3l1-1.7a1 1 0 0 1 1.2-.5l.9.3a7 7 0 0 1 1.8-1l.2-.9Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    ),
  },
]

export function SettingsNav({ locale, active, strings }: Props) {
  return (
    <nav aria-label={strings.heading} className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-1">
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={`/${locale}/settings/${tab.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
                : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
            }`}
          >
            <span className={isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}>
              {tab.icon}
            </span>
            {strings[tab.key]}
          </Link>
        )
      })}
    </nav>
  )
}
