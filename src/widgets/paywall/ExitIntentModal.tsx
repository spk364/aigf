'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaywallTeaser } from './teasers'
import { Modal, ModalCloseButton } from './Modal'
import { usePaywallAnalytics } from './usePaywallAnalytics'

export type ExitIntentStrings = {
  badge: string
  headline: string
  subheadline: string
  expiresIn: string
  pricePerMonth: string
  cta: string
  decline: string
  // {hours}h {minutes}m countdown — used as a fallback if Intl is unavailable.
  countdownFallback: string
  close: string
}

export type ExitIntentDiscount = {
  percentOff: number
  /** Cents — strikethrough anchor price. */
  originalPriceCents: number
  /** Cents — the post-discount price shown next to the strikethrough. */
  discountedPriceCents: number
  /** Hours from first impression before the countdown hits zero. */
  expiresInHours: number
}

type Props = {
  /** Pre-built URL that takes the user straight into the upgrade flow with the promo applied. */
  upgradeUrl: string
  teasers: PaywallTeaser[]
  /** Admin-supplied hero image. When set, replaces the 3-up teaser strip. */
  heroImageUrl?: string
  discount: ExitIntentDiscount
  strings: ExitIntentStrings
  /**
   * Trigger the modal whenever this number increments. Lets a parent
   * (`ExitIntentMount`) re-arm or force-open on demand without juggling
   * imperative refs.
   */
  forceOpenSeq?: number
}

const STORAGE_KEY = 'paywall.exitIntent.dismissedAt'
const FIRST_SHOWN_KEY = 'paywall.exitIntent.firstShownAt'
const COOLDOWN_MS = 24 * 60 * 60 * 1000

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Surfaces a one-time "wait! 50% off" modal when the user tries to leave the
 * /upgrade page. Triggers on:
 *   1. mouseout to the top edge of the viewport (desktop intent-to-leave)
 *   2. visibilitychange → hidden (tab switch / app switch)
 *   3. popstate (back-button on mobile)
 *
 * Once shown (or explicitly dismissed) we stash a timestamp in localStorage
 * and respect a 24h cooldown — the goal is "one last nudge", not nagware.
 */
export function ExitIntentModal({
  upgradeUrl,
  teasers,
  heroImageUrl,
  discount,
  strings,
  forceOpenSeq,
}: Props) {
  const [open, setOpen] = useState(false)
  // Whether the user has been "armed" for this session. We only set up the
  // mouseleave handler once their pointer has entered the document at least
  // once, so a SSR-painted page doesn't fire the modal on a stale cursor
  // position at (0,0).
  const armedRef = useRef(false)
  const triggeredRef = useRef(false)
  const track = usePaywallAnalytics()

  const onCooldown = () => {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < COOLDOWN_MS
  }

  const stamp = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      // private mode / quota — accept the loss, user just sees it again next visit.
    }
  }

  const trigger = (source: 'mouseleave' | 'visibility' | 'popstate' | 'manual') => {
    if (triggeredRef.current) return
    if (onCooldown()) return
    triggeredRef.current = true
    setOpen(true)
    try {
      window.localStorage.setItem(FIRST_SHOWN_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    track('paywall.exit_intent.shown', { source, percentOff: discount.percentOff })
  }

  // Wire up the three exit signals.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onMouseOut = (e: MouseEvent) => {
      if (!armedRef.current) return
      // Only the "moved off the top of the viewport" gesture counts — leaving
      // sideways is just reaching for a different tab and ends up false-firing.
      if (e.relatedTarget !== null) return
      if (e.clientY > 8) return
      trigger('mouseleave')
    }
    const onMouseMove = () => {
      armedRef.current = true
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') trigger('visibility')
    }
    const onPopState = () => {
      trigger('popstate')
    }

    // Push a sentinel history entry so a back-button press is intercepted
    // by `popstate` before the browser actually navigates away. The user can
    // still close the modal and press back again to leave.
    try {
      window.history.pushState({ paywallExitIntent: true }, '')
    } catch {
      // some embed contexts disallow history.pushState — fall back to the
      // other two triggers, which are enough.
    }

    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('popstate', onPopState)

    return () => {
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('popstate', onPopState)
    }
    // discount.percentOff is read inside `trigger` via closure; it never
    // changes within a session (server-rendered into props), so the empty
    // deps list is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External force-open hook (e.g. dev/debug, or a custom "Wait!" button
  // elsewhere). Skips the cooldown check on purpose.
  useEffect(() => {
    if (forceOpenSeq === undefined || forceOpenSeq === 0) return
    triggeredRef.current = false
    setOpen(true)
    track('paywall.exit_intent.shown', { source: 'manual', percentOff: discount.percentOff })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpenSeq])

  const close = (reason: 'backdrop' | 'decline' | 'cta') => {
    setOpen(false)
    stamp()
    track('paywall.exit_intent.dismissed', { reason, percentOff: discount.percentOff })
  }

  return (
    <Modal open={open} onClose={() => close('backdrop')} ariaLabel={strings.headline}>
      <ModalCloseButton onClick={() => close('decline')} label={strings.close} />

      {heroImageUrl ? (
        <HeroImage src={heroImageUrl} />
      ) : teasers.length > 0 ? (
        <TeaserStrip teasers={teasers} />
      ) : null}

      <div className="px-6 pb-7 pt-5 text-center sm:px-8">
        <DiscountBadge label={strings.badge} percent={discount.percentOff} />

        <h2 className="mt-3 text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">
          {strings.headline}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-muted)]">
          {strings.subheadline}
        </p>

        <PriceRow
          original={formatPrice(discount.originalPriceCents)}
          discounted={formatPrice(discount.discountedPriceCents)}
          perMonthLabel={strings.pricePerMonth}
        />

        <Countdown
          totalHours={discount.expiresInHours}
          expiresInLabel={strings.expiresIn}
          fallbackTemplate={strings.countdownFallback}
        />

        <a
          href={upgradeUrl}
          onClick={() => {
            track('paywall.exit_intent.cta_click', { percentOff: discount.percentOff })
            close('cta')
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--color-accent-strong)] to-[var(--color-accent)] px-6 py-3.5 text-sm font-bold text-[var(--color-bg)] shadow-[0_18px_40px_-12px_rgba(192,116,255,0.7)] transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          {strings.cta}
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <button
          type="button"
          onClick={() => close('decline')}
          className="mt-2.5 w-full text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
        >
          {strings.decline}
        </button>
      </div>
    </Modal>
  )
}

function HeroImage({ src }: { src: string }) {
  return (
    <div className="relative h-52 w-full overflow-hidden sm:h-64" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[var(--color-surface)]" />
    </div>
  )
}

function TeaserStrip({ teasers }: { teasers: PaywallTeaser[] }) {
  return (
    <div
      className="relative h-44 w-full overflow-hidden sm:h-52"
      aria-hidden
    >
      <div className="absolute inset-0 grid grid-cols-3 gap-px">
        {teasers.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.name}
            src={t.photoUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[var(--color-surface)]" />
    </div>
  )
}

function DiscountBadge({ label, percent }: { label: string; percent: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-strong)]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent-strong)]/30">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
        <path d="M3 6l3 3 4-6 4 6 3-3-2 10H5L3 6z" />
      </svg>
      {label} −{percent}%
    </span>
  )
}

function PriceRow({
  original,
  discounted,
  perMonthLabel,
}: {
  original: string
  discounted: string
  perMonthLabel: string
}) {
  return (
    <div className="mt-5 flex items-baseline justify-center gap-2">
      <span className="text-sm text-[var(--color-text-muted)] line-through">{original}</span>
      <span className="text-4xl font-bold text-[var(--color-text)]">{discounted}</span>
      <span className="text-xs text-[var(--color-text-muted)]">{perMonthLabel}</span>
    </div>
  )
}

/**
 * Counts down from the first time the user saw the offer in this browser
 * (stored alongside the cooldown stamp). If localStorage is unavailable
 * we just count down from `totalHours` — slightly less honest but never
 * shows a frozen 24:00:00.
 */
function Countdown({
  totalHours,
  expiresInLabel,
  fallbackTemplate,
}: {
  totalHours: number
  expiresInLabel: string
  fallbackTemplate: string
}) {
  const startedAt = useMemo<number>(() => {
    if (typeof window === 'undefined') return Date.now()
    const raw = window.localStorage.getItem(FIRST_SHOWN_KEY)
    const parsed = raw ? Number(raw) : NaN
    if (Number.isFinite(parsed)) return parsed
    return Date.now()
  }, [])

  const [remainingMs, setRemainingMs] = useState(
    Math.max(0, startedAt + totalHours * 3_600_000 - Date.now()),
  )

  useEffect(() => {
    const tick = () => {
      setRemainingMs(Math.max(0, startedAt + totalHours * 3_600_000 - Date.now()))
    }
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startedAt, totalHours])

  const hours = Math.floor(remainingMs / 3_600_000)
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const display = fallbackTemplate
    .replace('{hours}', pad(hours))
    .replace('{minutes}', pad(minutes))
    .replace('{seconds}', pad(seconds))

  return (
    <p className="mt-2 text-xs font-medium text-[var(--color-accent)]">
      {expiresInLabel} <span className="font-mono tabular-nums">{display}</span>
    </p>
  )
}
