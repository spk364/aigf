'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  onClose: () => void
  ariaLabel?: string
  children: React.ReactNode
}

/**
 * Minimal modal shell shared by the paywall surfaces. No headless-ui /
 * radix dependency: we already lean on Tailwind everywhere and the paywall
 * is the only modal in the app today, so a 50-line shell is cheaper than
 * pulling in a primitives library. Portal-renders into document.body so
 * scrolling chat containers can't clip the overlay.
 */
export function Modal({ open, onClose, ariaLabel, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="paywall-modal-card relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-[var(--color-surface)] shadow-2xl shadow-black/40 outline-none sm:rounded-3xl"
      >
        {children}
      </div>
      <style>{`
        .paywall-modal-card { animation: paywall-rise 240ms ease-out; }
        @keyframes paywall-rise {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  )
}

/**
 * Standardised "X" close button used in the top-right of every paywall
 * surface. Pulled out so both modals stay visually identical.
 */
export function ModalCloseButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}
