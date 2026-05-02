import Link from 'next/link'
import { FEATURED_PERSONAS } from './personas'
import { PersonaCard } from './PersonaCard'

type Props = {
  locale: string
}

export function FeaturedCompanions({ locale }: Props) {
  return (
    <section className="relative w-full bg-[var(--color-bg)] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              Featured companions
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              Meet someone new today
            </h2>
            <p className="mt-2 max-w-xl text-[var(--color-text-muted)]">
              Twelve unique personalities — from shy students to confident leaders, from poets to
              succubi. Pick anyone to start a conversation, or build your own.
            </p>
          </div>
          <Link
            href={`/${locale}/explore`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Browse all
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex gap-4 sm:gap-5">
            {FEATURED_PERSONAS.map((persona) => (
              <li key={persona.slug}>
                <PersonaCard
                  persona={persona}
                  href={`/${locale}/start?companion=${persona.slug}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
