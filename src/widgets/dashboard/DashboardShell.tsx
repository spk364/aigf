import Link from 'next/link'
import { logoutAction } from '@/features/auth/actions/logout'
import { redirect } from 'next/navigation'
import { MobileSidebar } from './MobileSidebar'

export type SidebarKey =
  | 'home'
  | 'explore'
  | 'create'
  | 'gallery'
  | 'tokens'
  | 'billing'

export type SidebarNavItem = {
  href: string
  label: string
  icon: 'home' | 'compass' | 'sparkles' | 'images' | 'coins' | 'crown'
  active?: boolean
}

type Props = {
  locale: string
  displayName: string
  email: string
  isPremium: boolean
  active?: SidebarKey
  children: React.ReactNode
}

export const SIDEBAR_ICONS: Record<SidebarNavItem['icon'], React.ReactNode> = {
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
  sparkles: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7L12 3zM18 14l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6L18 14zM5 16l.7 1.8L7.5 18l-1.8.7L5 20l-.7-1.5L2.5 18l1.8-.7L5 16z" />
    </svg>
  ),
  images: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5-5-9 9" />
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
    { href: `/${locale}/dashboard`, label: 'Home', icon: 'home', active: active === 'home' },
    { href: `/${locale}/explore`, label: 'Explore', icon: 'compass', active: active === 'explore' },
    { href: `/${locale}/start`, label: 'Create', icon: 'sparkles', active: active === 'create' },
    { href: `/${locale}/tokens`, label: 'Tokens', icon: 'coins', active: active === 'tokens' },
    { href: `/${locale}/billing/manage`, label: 'Billing', icon: 'crown', active: active === 'billing' },
  ]
}

export async function DashboardShell({
  locale,
  displayName,
  email,
  isPremium,
  active = 'home',
  children,
}: Props) {
  const navItems = buildNavItems(locale, active)
  const initial = (displayName || email || '?').charAt(0).toUpperCase()

  async function handleLogout() {
    'use server'
    await logoutAction()
    redirect(`/${locale}/login`)
  }

  const profileBlock = (
    <div className="border-t border-[var(--color-border)] p-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg p-2">
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
            {displayName}
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
  )

  const navBlock = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="flex flex-col gap-1">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ' +
                (item.active
                  ? 'bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]')
              }
            >
              <span
                className={
                  item.active
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'
                }
              >
                {SIDEBAR_ICONS[item.icon]}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-sm md:flex">
        <Link
          href={`/${locale}/dashboard`}
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
        {profileBlock}
      </aside>

      {/* Mobile drawer (client component handles open/close state) */}
      <MobileSidebar>
        <div className="flex h-14 items-center border-b border-[var(--color-border)] px-4">
          <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
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
          href={`/${loc.code}/dashboard`}
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
