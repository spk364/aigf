import Link from 'next/link'
import { getCurrentUser } from '@/shared/auth/current-user'

type Props = {
  locale: string
}

export async function SiteHeader({ locale }: Props) {
  const user = await getCurrentUser()
  const isAuthed = !!user

  const navItems = [
    { href: `/${locale}/explore`, label: 'Explore' },
    { href: `/${locale}/try`, label: 'Create' },
    { href: `/${locale}/pricing`, label: 'Pricing' },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[var(--color-bg)]/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 text-[var(--color-text)] transition-opacity hover:opacity-80"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)] text-sm font-black text-[var(--color-bg)]"
          >
            G
          </span>
          <span className="text-lg font-bold tracking-tight">girlfriend.ai</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <LocaleSwitcher currentLocale={locale} />
          {isAuthed ? (
            <Link
              href={`/${locale}/dashboard`}
              className="inline-flex items-center justify-center rounded-lg bg-[var(--color-accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href={`/${locale}/login`}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href={`/${locale}/try`}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--color-accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

function LocaleSwitcher({ currentLocale }: { currentLocale: string }) {
  const locales = [
    { code: 'en', label: 'EN' },
    { code: 'ru', label: 'RU' },
    { code: 'es', label: 'ES' },
  ]
  return (
    <div className="hidden items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-0.5 sm:flex">
      {locales.map((loc) => (
        <Link
          key={loc.code}
          href={`/${loc.code}`}
          aria-current={loc.code === currentLocale ? 'page' : undefined}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            loc.code === currentLocale
              ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {loc.label}
        </Link>
      ))}
    </div>
  )
}
