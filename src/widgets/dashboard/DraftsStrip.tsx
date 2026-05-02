import Link from 'next/link'
import type { DraftRow } from '@/features/dashboard/queries'

type Props = {
  locale: string
  drafts: DraftRow[]
}

export function DraftsStrip({ locale, drafts }: Props) {
  if (drafts.length === 0) return null
  return (
    <section className="rounded-2xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-strong)]/5 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Continue building
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {drafts.length} draft{drafts.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {drafts.map((d) => (
          <Link
            key={d.id}
            href={`/${locale}/builder/${d.id}`}
            className="group flex shrink-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)]"
          >
            {d.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.thumbnailUrl}
                alt={d.name}
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-[var(--color-bg)]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
                }}
                aria-hidden
              >
                {d.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">
                {d.name}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Step {d.step} / 4
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
