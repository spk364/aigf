// Skeleton shown while the chat list page (welcome state + character grid)
// is fetching server-side data. The chat layout's left sidebar streams in
// independently via its own Suspense boundary.
export default function ChatLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-32 animate-pulse rounded bg-[var(--color-surface-2)]" />
            <div className="h-3.5 w-44 animate-pulse rounded bg-[var(--color-surface-2)]/70" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        </div>

        <div className="mb-6 h-3 w-32 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--color-surface-2)]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--color-surface-2)]/70" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--color-surface-2)]/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
