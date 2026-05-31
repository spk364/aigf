'use client'

import { useState } from 'react'
import { PHOTO_OPTION_GROUPS, buildPhotoRequest } from '@/features/chat/photo-options'

export type PhotoComposerStrings = {
  title: string
  subtitle: string
  groups: { outfit: string; pose: string; setting: string }
  // labelKey ("outfit.dress") → translated chip label
  options: Record<string, string>
  extraPlaceholder: string
  send: string
  cancel: string
}

type Props = {
  strings: PhotoComposerStrings
  cost: number
  onSubmit: (message: string) => void
  onClose: () => void
}

// A small sheet that opens above the composer when the user taps the photo chip.
// Lets them pick an outfit / pose / setting (all optional), then builds a natural
// photo-request message that flows through the existing image-intent pipeline.
export function PhotoComposer({ strings: s, cost, onSubmit, onClose }: Props) {
  const [outfit, setOutfit] = useState<string | undefined>()
  const [pose, setPose] = useState<string | undefined>()
  const [setting, setSetting] = useState<string | undefined>()
  const [extra, setExtra] = useState('')

  const selByGroup: Record<string, [string | undefined, (v: string | undefined) => void]> = {
    outfit: [outfit, setOutfit],
    pose: [pose, setPose],
    setting: [setting, setSetting],
  }

  const handleSend = () => {
    const fragments: { outfit?: string; pose?: string; setting?: string; extra?: string } = {}
    for (const g of PHOTO_OPTION_GROUPS) {
      const [selectedKey] = selByGroup[g.group]!
      if (!selectedKey) continue
      const opt = g.options.find((o) => o.key === selectedKey)
      if (opt) fragments[g.group] = opt.prompt
    }
    if (extra.trim()) fragments.extra = extra.trim()
    onSubmit(buildPhotoRequest(fragments))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
      <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)]/95 p-4 shadow-xl shadow-black/30 backdrop-blur-md">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">{s.title}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{s.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.cancel}
            className="shrink-0 rounded-full p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[40dvh] space-y-3 overflow-y-auto">
          {PHOTO_OPTION_GROUPS.map((g) => {
            const [selectedKey, setSelected] = selByGroup[g.group]!
            return (
              <div key={g.group}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {s.groups[g.group]}
                </p>
                <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
                  {g.options.map((o) => {
                    const isActive = selectedKey === o.key
                    return (
                      <button
                        key={o.key}
                        type="button"
                        // Toggle: tapping the active chip clears it.
                        onClick={() => setSelected(isActive ? undefined : o.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${
                          isActive
                            ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/20 text-[var(--color-text)]'
                            : 'border-white/10 bg-[var(--color-surface-2)]/70 text-[var(--color-text-muted)] hover:border-[var(--color-accent-strong)]/40 hover:text-[var(--color-text)]'
                        }`}
                      >
                        {s.options[o.labelKey] ?? o.key}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <input
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={s.extraPlaceholder}
            maxLength={120}
            className="w-full rounded-xl border border-white/10 bg-[var(--color-surface-2)]/70 px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)]/50"
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
        >
          {s.send}
          <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold">
            {cost}
          </span>
        </button>
      </div>
    </div>
  )
}
