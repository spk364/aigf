// Skeleton for the active conversation pane while messages + character data
// load server-side. Mirrors the ChatInterface structure (sticky header,
// alternating bubbles, sticky composer) so the user sees the right shape
// before content swaps in.
export default function ConversationLoading() {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* Header skeleton */}
      <header className="relative z-20 flex min-h-[3.25rem] items-center gap-2 border-b border-white/5 bg-[var(--color-bg)]/80 px-2 py-2 backdrop-blur-md sm:gap-3 sm:px-5 sm:py-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-32 animate-pulse rounded bg-[var(--color-surface-2)]" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-[var(--color-surface-2)]/70" />
        </div>
        <div className="hidden h-7 w-16 animate-pulse rounded-full bg-[var(--color-surface-2)] sm:block" />
      </header>

      {/* Messages skeleton — alternating sides for chat feel */}
      <div className="relative z-10 flex-1 overflow-hidden px-3 py-5 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <SkeletonBubble side="left" width="60%" />
          <SkeletonBubble side="left" width="45%" />
          <SkeletonBubble side="right" width="40%" />
          <SkeletonBubble side="left" width="70%" />
          <SkeletonBubble side="right" width="50%" />
          <SkeletonBubble side="left" width="35%" />
        </div>
      </div>

      {/* Composer skeleton */}
      <div className="relative z-10 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
        <div className="mx-auto h-12 max-w-3xl animate-pulse rounded-full border border-white/10 bg-[var(--color-surface)]/95" />
      </div>
    </div>
  )
}

function SkeletonBubble({ side, width }: { side: 'left' | 'right'; width: string }) {
  const isUser = side === 'right'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <div className="h-7 w-7 shrink-0 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />}
      <div
        className={`h-10 animate-pulse ${isUser ? 'rounded-3xl rounded-br-md bg-[var(--color-accent-strong)]/30' : 'rounded-3xl rounded-bl-md bg-[var(--color-surface-2)]'}`}
        style={{ width }}
      />
    </div>
  )
}
