'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Props = {
  children: React.ReactNode
}

export function MobileSidebar({ children }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 backdrop-blur-md md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="-ml-2 rounded-lg p-2 text-[var(--color-text)] hover:bg-white/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-base font-bold tracking-tight">girlfriend.ai</span>
        <span className="w-8" aria-hidden />
      </header>

      <div
        className={
          'fixed inset-0 z-50 md:hidden ' + (open ? '' : 'pointer-events-none')
        }
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className={
            'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ' +
            (open ? 'opacity-100' : 'opacity-0')
          }
        />
        <div
          className={
            'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          {children}
        </div>
      </div>
    </>
  )
}
