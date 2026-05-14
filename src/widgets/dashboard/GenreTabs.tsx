import Link from 'next/link'

type Props = {
  locale: string
  active?: 'girls' | 'anime' | 'guys'
}

type Tab = {
  key: 'girls' | 'anime' | 'guys'
  label: string
  href: string
  icon: React.ReactNode
}

function GirlIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-3.5 w-3.5">
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M12 12v9M9 18h6" />
    </svg>
  )
}

function AnimeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.4 5.4L20 9l-4.4 3.8L17 19l-5-3.2L7 19l1.4-6.2L4 9l5.6-.6L12 3z" />
    </svg>
  )
}

function GuyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-3.5 w-3.5">
      <circle cx="10" cy="14" r="6" />
      <path strokeLinecap="round" d="M14 10l6-6M16 4h4v4" />
    </svg>
  )
}

export function GenreTabs({ locale, active = 'girls' }: Props) {
  const tabs: Tab[] = [
    {
      key: 'girls',
      label: 'Girls',
      href: `/${locale}/ai-girlfriend`,
      icon: <GirlIcon />,
    },
    {
      key: 'anime',
      label: 'Anime',
      href: `/${locale}/ai-anime`,
      icon: <AnimeIcon />,
    },
    {
      key: 'guys',
      label: 'Guys',
      href: `/${locale}/ai-boyfriend`,
      icon: <GuyIcon />,
    },
  ]

  return (
    <nav className="flex items-center gap-1.5 sm:gap-2" aria-label="Genre">
      {tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ' +
              (isActive
                ? 'border-[var(--color-accent-strong)] text-[var(--color-text)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]')
            }
          >
            <span className={isActive ? 'text-[var(--color-accent)]' : ''}>{tab.icon}</span>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
