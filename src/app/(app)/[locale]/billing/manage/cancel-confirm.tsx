'use client'

import { useState } from 'react'

type Props = {
  cancelAction: () => Promise<void>
  t: (key: string) => string
}

export default function CancelConfirm({ cancelAction, t }: Props) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 px-4 py-2.5 text-sm text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]"
      >
        {t('cancelTitle')}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-5">
      <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-muted)]">
        {t('cancelConfirm')}
      </p>
      <div className="flex flex-wrap gap-3">
        <form action={cancelAction}>
          <button
            type="submit"
            className="rounded-xl bg-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-danger)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]"
          >
            {t('cancelTitle')}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border)]"
        >
          Keep subscription
        </button>
      </div>
    </div>
  )
}
