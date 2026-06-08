import Link from 'next/link'
import { logoutAction } from '@/features/auth/actions/logout'
import { redirect } from 'next/navigation'
import { MobileSidebar } from './MobileSidebar'
import { TokenBalancePill } from './TokenBalancePill'

export type SidebarKey =
  | 'home'
  | 'discover'
  | 'chat'
  | 'collection'
  | 'create'
  | 'my-ai'
  | 'tokens'
  | 'premium'
  | 'settings'

export type SidebarNavItem = {
  href: string
  label: string
  icon: SidebarIcon
  active?: boolean
  badge?: string
  disabled?: boolean
}

export type SidebarIcon =
  | 'home'
  | 'compass'
  | 'chat'
  | 'bookmark'
  | 'sparkles'
  | 'heart'
  | 'coins'
  | 'crown'

type Props = {
  locale: string
  displayName?: string | null
  email?: string | null
  isPremium?: boolean
  active?: SidebarKey
  children: React.ReactNode
}

export const SIDEBAR_ICONS: Record<SidebarIcon, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-5a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 001 1h3a1 1 0 001-1V10" />
    </svg>
  ),
  compass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 9.5l-1.4 4.4-4.4 1.4 1.4-4.4 4.4-1.4z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 11-3.4-6.5L21 4l-1 4.5A8 8 0 0121 12z" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z" />
    </svg>
  ),
  sparkles: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7L12 3zM18 14l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6L18 14zM5 16l.7 1.8L7.5 18l-1.8.7L5 20l-.7-1.5L2.5 18l1.8-.7L5 16z" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.35-9.5-9.13C.93 8.45 2.6 4.86 5.84 4.86c1.95 0 3.42 1.1 4.16 2.58.74-1.48 2.21-2.58 4.16-2.58 3.24 0 4.91 3.59 3.34 7.01C19 16.65 12 21 12 21z" />
    </svg>
  ),
  coins: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  crown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z" />
    </svg>
  ),
}

export function buildNavItems(
  locale: string,
  active: SidebarKey | undefined,
): SidebarNavItem[] {
  return [
    { href: `/${locale}`, label: 'Home', icon: 'home', active: active === 'home' },
    { href: `/${locale}/explore`, label: 'Discover', icon: 'compass', active: active === 'discover' },
    { href: `/${locale}/chat`, label: 'Chat', icon: 'chat', active: active === 'chat' },
    // TODO: dedicated /collection route — saved/bookmarked personas + media gallery.
    { href: '#', label: 'Collection', icon: 'bookmark', active: active === 'collection', disabled: true },
    { href: `/${locale}/start`, label: 'Create Character', icon: 'sparkles', active: active === 'create' },
    // TODO: /my-ai route — currently routed to /chat which lists user conversations.
    { href: `/${locale}/chat`, label: 'My AI', icon: 'heart', active: active === 'my-ai' },
    {
      href: `/${locale}/plans`,
      label: 'Premium',
      icon: 'crown',
      active: active === 'premium',
      badge: '-70%',
    },
  ]
}

// TODO: wire to real Discord invite, help center, contact form, and affiliate page.
const FOOTER_LINKS: ReadonlyArray<{ label: string; icon: React.ReactNode }> = [
  {
    label: 'Discord',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
        <path d="M19.27 5.33A18 18 0 0014.94 4l-.21.45a16.7 16.7 0 014 1.95 12.4 12.4 0 00-13.46 0 16.7 16.7 0 014-1.95L9.06 4a18 18 0 00-4.33 1.33A18.6 18.6 0 002 16.5a18 18 0 005.5 2.78l1.1-1.5a11 11 0 01-1.74-.85l.43-.32a12.7 12.7 0 0011.4 0l.43.32c-.55.32-1.13.6-1.74.85l1.1 1.5A18 18 0 0022 16.5a18.6 18.6 0 00-2.73-11.17zM9 14a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
      </svg>
    ),
  },
  {
    label: 'Help Center',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 015 .5c0 1-.5 1.5-1.5 2-.7.4-1 .8-1 1.5M12 17h.01" />
      </svg>
    ),
  },
  {
    label: 'Contact Us',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4zM4 6l8 7 8-7" />
      </svg>
    ),
  },
  {
    label: 'Affiliate',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l6-6M9.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM17.5 15a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
]

export async function DashboardShell({
  locale,
  displayName,
  email,
  isPremium,
  active = 'home',
  children,
}: Props) {
  const navItems = buildNavItems(locale, active)
  const isAuthed = !!(displayName || email)
  const initial = (displayName || email || '?').charAt(0).toUpperCase()

  async function handleLogout() {
    'use server'
    await logoutAction()
    redirect(`/${locale}/login`)
  }

  const profileBlock = isAuthed ? (
    <div className="border-t border-[var(--color-border)] p-3">
      {/* The profile row links to settings — the conventional spot users look
          for account controls. */}
      <Link
        href={`/${locale}/settings`}
        className="mb-2 flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/5"
      >
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-[var(--color-bg)]"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
          }}
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
            {displayName || email}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {isPremium ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-bg)]">
                Premium
              </span>
            ) : (
              <span>Free plan</span>
            )}
          </p>
        </div>
        <span className="text-[var(--color-text-muted)]" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </Link>
      <div className="mb-2">
        <TokenBalancePill locale={locale} label="Tokens" />
      </div>
      <div className="flex items-center gap-1.5">
        <LocaleSwitcher locale={locale} />
        <form action={handleLogout} className="flex-1">
          <button
            type="submit"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  ) : (
    <div className="border-t border-[var(--color-border)] p-3">
      <div className="flex flex-col gap-2">
        <Link
          href={`/${locale}/signup`}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--color-accent-strong)] px-3 py-2 text-xs font-bold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
        >
          Create free account
        </Link>
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          Sign in
        </Link>
        <div className="mt-1">
          <LocaleSwitcher locale={locale} />
        </div>
      </div>
    </div>
  )

  const footerLinksBlock = (
    <div className="border-t border-[var(--color-border)] px-3 py-3">
      <ul className="flex flex-col gap-1">
        {FOOTER_LINKS.map((item) => (
          <li key={item.label}>
            <span
              role="link"
              aria-disabled="true"
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]/80 hover:bg-white/5"
            >
              <span className="text-[var(--color-text-muted)]/70">{item.icon}</span>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  const navBlock = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="flex flex-col gap-1">
        {navItems.map((item) => {
          const baseClass =
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
          const stateClass = item.active
            ? 'bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
            : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]'
          const iconClass = item.active
            ? 'text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'

          if (item.disabled) {
            return (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  title="Coming soon"
                  className={`${baseClass} cursor-not-allowed text-[var(--color-text-muted)]/60`}
                >
                  <span className="text-[var(--color-text-muted)]/60">
                    {SIDEBAR_ICONS[item.icon]}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Soon
                  </span>
                </span>
              </li>
            )
          }

          return (
            <li key={item.href + item.label}>
              <Link
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`${baseClass} ${stateClass}`}
              >
                <span className={iconClass}>{SIDEBAR_ICONS[item.icon]}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    // min-h-dvh (not 100vh): on iOS Safari 100vh is the *large* viewport, which
    // is taller than the visible area while the URL bar is showing. With the
    // chat layout sizing itself in dvh, a vh-based shell left a scrollable gap
    // of empty space below the chat. dvh keeps the shell exactly viewport-tall.
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-sm md:flex">
        <Link
          href={`/${locale}`}
          className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-5"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)] text-base font-black text-[var(--color-bg)]"
          >
            G
          </span>
          <span className="text-base font-bold tracking-tight">girlfriend.ai</span>
        </Link>
        {navBlock}
        {footerLinksBlock}
        {profileBlock}
      </aside>

      {/* Mobile drawer (client component handles open/close state) */}
      <MobileSidebar>
        <div className="flex h-14 items-center border-b border-[var(--color-border)] px-4">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)] text-sm font-black text-[var(--color-bg)]"
            >
              G
            </span>
            <span className="text-base font-bold tracking-tight">girlfriend.ai</span>
          </Link>
        </div>
        {navBlock}
        {footerLinksBlock}
        {profileBlock}
      </MobileSidebar>

      {/* Main content */}
      <div className="md:pl-60">{children}</div>
    </div>
  )
}

function LocaleSwitcher({ locale }: { locale: string }) {
  const locales = [
    { code: 'en', label: 'EN' },
    { code: 'ru', label: 'RU' },
    { code: 'es', label: 'ES' },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-0.5">
      {locales.map((loc) => (
        <Link
          key={loc.code}
          href={`/${loc.code}`}
          aria-current={loc.code === locale ? 'page' : undefined}
          className={
            'rounded-md px-1.5 py-1 text-[10px] font-bold transition-colors ' +
            (loc.code === locale
              ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]')
          }
        >
          {loc.label}
        </Link>
      ))}
    </div>
  )
}
