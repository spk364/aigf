'use client'

import { useEffect } from 'react'
import type { PaywallTeaser } from './teasers-types'
import { Modal, ModalCloseButton } from './Modal'
import { usePaywallAnalytics } from './usePaywallAnalytics'

export type ChatPaywallReason = 'quota' | 'tokens' | 'premium_feature'

export type ChatPaywallStrings = {
  badge: string
  /** "{name}" inside subheadline gets replaced with the current character. */
  headline: string
  subheadline: string
  perks: string[]
  monthlyLabel: string
  yearlyLabel: string
  yearlySaveLabel: string
  pricePerMonth: string
  pricePerYear: string
  primaryCta: string
  secondaryCta: string
  decline: string
  close: string
}

export type ChatPaywallPlans = {
  monthlyPriceCents: number
  yearlyPriceCents: number
  yearlySavePercent: number
}

type Props = {
  open: boolean
  onClose: () => void
  reason: ChatPaywallReason
  locale: string
  /** Built upstream so it can include `?promo=...` and the current locale prefix. */
  upgradeUrl: string
  /** Backup CTA — sends the user to the tokens page when reason='tokens'. */
  tokensUrl: string
  characterName: string
  characterPhotoUrl?: string
  fallbackTeaser?: PaywallTeaser
  plans: ChatPaywallPlans
  strings: ChatPaywallStrings
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Inline paywall surfaced from the chat when a free-tier user hits a quota
 * wall or runs out of tokens mid-conversation. Designed to feel like a
 * continuation of the chat (current companion's face, in-character copy)
 * rather than a generic interstitial — that's the lift candy.ai / joi.ai
 * earn over the bare error banner we had before.
 */
export function ChatPaywallModal({
  open,
  onClose,
  reason,
  upgradeUrl,
  tokensUrl,
  characterName,
  characterPhotoUrl,
  fallbackTeaser,
  plans,
  strings,
}: Props) {
  const track = usePaywallAnalytics()

  useEffect(() => {
    if (!open) return
    track('paywall.chat.shown', { reason })
  }, [open, reason, track])

  const heroPhoto = characterPhotoUrl ?? fallbackTeaser?.photoUrl
  const heroName = characterName || fallbackTeaser?.name || ''
  const headline = strings.headline.replace('{name}', heroName)
  const subheadline = strings.subheadline.replace('{name}', heroName)
  // For "tokens" we surface a secondary "just top up" path — for the other
  // two reasons the only way out is a subscription, so we collapse to one
  // primary CTA.
  const showTokensFallback = reason === 'tokens'

  const close = (reason_: 'backdrop' | 'decline') => {
    track('paywall.chat.dismissed', { reason, source: reason_ })
    onClose()
  }

  return (
    <Modal open={open} onClose={() => close('backdrop')} ariaLabel={headline}>
      <ModalCloseButton onClick={() => close('decline')} label={strings.close} />

      {heroPhoto && <HeroPhoto src={heroPhoto} name={heroName} />}

      <div className="px-6 pb-7 pt-5 text-center sm:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-strong)]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent-strong)]/30">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
            <path d="M10 3.22l-.61-.6a5.5 5.5 0 00-7.78 7.77L10 18.78l8.39-8.4a5.5 5.5 0 00-7.78-7.77l-.61.6z" />
          </svg>
          {strings.badge}
        </span>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-[28px]">
          {headline}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-muted)]">
          {subheadline}
        </p>

        <PerksList perks={strings.perks} />

        <PlanButtons
          upgradeUrl={upgradeUrl}
          plans={plans}
          strings={strings}
          onPlanClick={(plan) =>
            track('paywall.chat.cta_click', { reason, plan, kind: 'subscription' })
          }
        />

        {showTokensFallback && (
          <a
            href={tokensUrl}
            onClick={() => track('paywall.chat.cta_click', { reason, kind: 'tokens' })}
            className="mt-3 inline-block text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
          >
            {strings.secondaryCta}
          </a>
        )}

        <button
          type="button"
          onClick={() => close('decline')}
          className="mt-3 block w-full text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
        >
          {strings.decline}
        </button>
      </div>
    </Modal>
  )
}

function HeroPhoto({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative h-56 w-full overflow-hidden sm:h-64">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} className="h-full w-full object-cover object-top" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent via-[var(--color-surface)]/40 to-[var(--color-surface)]" />
      {name && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {name}
        </div>
      )}
    </div>
  )
}

function PerksList({ perks }: { perks: string[] }) {
  return (
    <ul className="mx-auto mt-5 grid max-w-sm gap-1.5 text-left text-sm text-[var(--color-text)]">
      {perks.map((perk) => (
        <li key={perk} className="flex items-start gap-2">
          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--color-accent-strong)]/20 text-[var(--color-accent)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span>{perk}</span>
        </li>
      ))}
    </ul>
  )
}

function PlanButtons({
  upgradeUrl,
  plans,
  strings,
  onPlanClick,
}: {
  upgradeUrl: string
  plans: ChatPaywallPlans
  strings: ChatPaywallStrings
  onPlanClick: (plan: 'monthly' | 'yearly') => void
}) {
  // The "yearly" button is the emphasised default — same playbook as
  // /upgrade where the most-popular badge sits on a longer commitment.
  return (
    <div className="mt-5 grid gap-2.5">
      <a
        href={upgradeUrl}
        onClick={() => onPlanClick('yearly')}
        className="relative flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-[var(--color-accent-strong)] to-[var(--color-accent)] px-5 py-3.5 text-sm font-bold text-[var(--color-bg)] shadow-[0_18px_40px_-12px_rgba(192,116,255,0.7)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <span>{strings.yearlyLabel}</span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            {strings.yearlySaveLabel.replace('{percent}', String(plans.yearlySavePercent))}
          </span>
          <span>
            {formatPrice(plans.yearlyPriceCents)}
            <span className="opacity-80">{strings.pricePerYear}</span>
          </span>
        </span>
      </a>
      <a
        href={upgradeUrl}
        onClick={() => onPlanClick('monthly')}
        className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]"
      >
        <span>{strings.monthlyLabel}</span>
        <span>
          {formatPrice(plans.monthlyPriceCents)}
          <span className="text-[var(--color-text-muted)]">{strings.pricePerMonth}</span>
        </span>
      </a>
      <span className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {strings.primaryCta}
      </span>
    </div>
  )
}
