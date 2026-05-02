import Link from 'next/link'

type Props = {
  locale: string
}

export function SiteFooter({ locale }: Props) {
  const sections = [
    {
      title: 'Product',
      links: [
        { href: `/${locale}/explore`, label: 'Explore companions' },
        { href: `/${locale}/builder`, label: 'Create your own' },
        { href: `/${locale}/pricing`, label: 'Pricing' },
      ],
    },
    {
      title: 'Account',
      links: [
        { href: `/${locale}/login`, label: 'Sign in' },
        { href: `/${locale}/signup`, label: 'Get started' },
        { href: `/${locale}/dashboard`, label: 'Dashboard' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: `/${locale}/legal/terms`, label: 'Terms of Service' },
        { href: `/${locale}/legal/privacy`, label: 'Privacy Policy' },
        { href: `/${locale}/legal/content-policy`, label: 'Content Policy' },
        { href: `/${locale}/legal/2257`, label: '18 U.S.C. §2257' },
      ],
    },
  ]

  return (
    <footer className="relative border-t border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link href={`/${locale}`} className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)] text-sm font-black text-[var(--color-bg)]"
              >
                G
              </span>
              <span className="text-lg font-bold tracking-tight text-[var(--color-text)]">
                girlfriend.ai
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-text-muted)]">
              An AI companion who listens, understands, and is always here — whenever you need them.
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--color-text)]/85 transition-colors hover:text-[var(--color-accent)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} girlfriend.ai · All companions are AI-generated and 21+
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center rounded border border-[var(--color-border)] px-1.5 font-bold tracking-wider text-[var(--color-text)]">
              18+
            </span>
            By using this site you confirm you are over 18 years old.
          </p>
        </div>
      </div>
    </footer>
  )
}
