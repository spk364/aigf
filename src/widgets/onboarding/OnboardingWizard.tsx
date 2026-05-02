'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BODY_OPTIONS,
  EYE_COLOR_OPTIONS,
  HAIR_COLOR_OPTIONS,
  NAME_SUGGESTIONS,
  PERSONALITY_OPTIONS,
  STYLE_OPTIONS,
  TOTAL_STEPS,
  type OnboardingChoices,
  type Option,
} from './data'
import { CompanionPreview } from './CompanionPreview'
import {
  generateGuestPreviewAction,
  selectGuestPreviewAction,
} from '@/features/builder/guest-actions'

type GeneratedPreview = {
  mediaAssetId: string
  publicUrl: string
}

function choicesToAppearance(choices: OnboardingChoices): Record<string, unknown> {
  const appearance: Record<string, unknown> = {}
  if (choices.style) appearance.artStyle = choices.style
  if (choices.body) appearance.bodyType = choices.body
  if (choices.hairColor) appearance.hair = { color: choices.hairColor }
  if (choices.eyeColor) appearance.eyes = { color: choices.eyeColor }
  return appearance
}

const STORAGE_KEY = 'gfai_onboarding_v1'

type Props = {
  locale: string
}

type StepDef = {
  key: keyof OnboardingChoices
  question: string
  subtitle: string
  options?: Option[]
  type: 'cards' | 'swatches' | 'name'
}

const STEPS: StepDef[] = [
  {
    key: 'style',
    question: 'Pick a style',
    subtitle: 'How should she look?',
    options: STYLE_OPTIONS,
    type: 'cards',
  },
  {
    key: 'body',
    question: 'Choose her body',
    subtitle: 'You can fine-tune later',
    options: BODY_OPTIONS,
    type: 'cards',
  },
  {
    key: 'hairColor',
    question: 'Hair color',
    subtitle: 'Pick a shade',
    options: HAIR_COLOR_OPTIONS,
    type: 'swatches',
  },
  {
    key: 'eyeColor',
    question: 'Eye color',
    subtitle: 'A pair of eyes she’ll look at you with',
    options: EYE_COLOR_OPTIONS,
    type: 'swatches',
  },
  {
    key: 'personality',
    question: 'What’s her vibe?',
    subtitle: 'This shapes how she talks to you',
    options: PERSONALITY_OPTIONS,
    type: 'cards',
  },
  {
    key: 'name',
    question: 'Give her a name',
    subtitle: 'You can change it anytime',
    type: 'name',
  },
]

export function OnboardingWizard({ locale }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [choices, setChoices] = useState<OnboardingChoices>({})
  const [done, setDone] = useState(false)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { choices: OnboardingChoices; step: number }
        if (parsed.choices) setChoices(parsed.choices)
        if (typeof parsed.step === 'number') {
          setStepIndex(Math.min(parsed.step, STEPS.length - 1))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!restoredRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choices, step: stepIndex }))
    } catch {
      // ignore
    }
  }, [choices, stepIndex])

  const step = STEPS[stepIndex]!
  const progress = done ? 100 : Math.round(((stepIndex + 1) / TOTAL_STEPS) * 100)

  const select = (key: keyof OnboardingChoices, value: string) => {
    setChoices((c) => ({ ...c, [key]: value }))
    if (stepIndex < STEPS.length - 1) {
      setTimeout(() => setStepIndex(stepIndex + 1), 220)
    } else {
      setTimeout(() => setDone(true), 220)
    }
  }

  const goBack = () => {
    if (done) {
      setDone(false)
      return
    }
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }

  const reset = () => {
    setChoices({})
    setStepIndex(0)
    setDone(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col px-4 pb-12 pt-8 sm:px-6">
      <ProgressBar percent={progress} />

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={!done && stepIndex === 0}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors enabled:hover:bg-white/5 enabled:hover:text-[var(--color-text)] disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Back
        </button>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          {done ? 'All done' : `Step ${stepIndex + 1} of ${TOTAL_STEPS}`}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          Reset
        </button>
      </div>

      {!done ? (
        <StepView step={step} choices={choices} onSelect={select} />
      ) : (
        <RevealView locale={locale} choices={choices} />
      )}
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function StepView({
  step,
  choices,
  onSelect,
}: {
  step: StepDef
  choices: OnboardingChoices
  onSelect: (key: keyof OnboardingChoices, value: string) => void
}) {
  return (
    <div className="mt-8 flex flex-col items-center text-center">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
        {step.question}
      </h1>
      <p className="mt-2 text-[var(--color-text-muted)]">{step.subtitle}</p>

      <div className="mt-10 w-full">
        {step.type === 'cards' && step.options && (
          <CardsGrid
            options={step.options}
            selected={choices[step.key]}
            onSelect={(v) => onSelect(step.key, v)}
          />
        )}
        {step.type === 'swatches' && step.options && (
          <SwatchesGrid
            options={step.options}
            selected={choices[step.key]}
            onSelect={(v) => onSelect(step.key, v)}
          />
        )}
        {step.type === 'name' && (
          <NameInput
            initial={choices.name ?? ''}
            onSubmit={(v) => onSelect('name', v)}
          />
        )}
      </div>
    </div>
  )
}

function CardsGrid({
  options,
  selected,
  onSelect,
}: {
  options: Option[]
  selected: string | undefined
  onSelect: (v: string) => void
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {options.map((opt) => {
        const isSelected = selected === opt.value
        const hue = opt.hue ?? 290
        const tileStyle: CSSProperties = {
          background: `linear-gradient(155deg, hsl(${hue} 70% 55%) 0%, hsl(${(hue + 35) % 360} 60% 38%) 60%, hsl(${(hue + 70) % 360} 55% 22%) 100%)`,
        }
        return (
          <li key={opt.value}>
            <button
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-[var(--color-accent-strong)] shadow-[0_18px_50px_-12px_rgba(192,116,255,0.55)]'
                  : 'border-transparent hover:-translate-y-0.5 hover:border-[var(--color-border)]'
              }`}
            >
              <div className="relative aspect-[3/4] w-full" style={tileStyle}>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 50%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                {isSelected && (
                  <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-accent-strong)] text-[var(--color-bg)] shadow-lg">
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06L8.674 12.26l6.97-6.97a.75.75 0 011.06 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                )}
              </div>
              <div className="bg-[var(--color-surface)] p-3">
                <p className="text-base font-bold text-[var(--color-text)]">{opt.label}</p>
                {opt.description && (
                  <p className="mt-0.5 text-xs leading-snug text-[var(--color-text-muted)]">
                    {opt.description}
                  </p>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SwatchesGrid({
  options,
  selected,
  onSelect,
}: {
  options: Option[]
  selected: string | undefined
  onSelect: (v: string) => void
}) {
  return (
    <ul className="mx-auto grid max-w-xl grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
      {options.map((opt) => {
        const isSelected = selected === opt.value
        const hue = opt.hue ?? 290
        const swatchStyle: CSSProperties = {
          background: `linear-gradient(135deg, hsl(${hue} 70% 50%) 0%, hsl(${hue} 60% 30%) 100%)`,
        }
        return (
          <li key={opt.value} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => onSelect(opt.value)}
              aria-label={opt.label}
              className={`relative h-20 w-20 overflow-hidden rounded-full border-4 transition-all sm:h-24 sm:w-24 ${
                isSelected
                  ? 'border-[var(--color-accent-strong)] shadow-[0_8px_30px_-6px_rgba(192,116,255,0.7)]'
                  : 'border-[var(--color-border)] hover:scale-105 hover:border-[var(--color-text-muted)]'
              }`}
              style={swatchStyle}
            >
              {isSelected && (
                <span className="absolute inset-0 grid place-items-center bg-black/30">
                  <svg viewBox="0 0 20 20" fill="white" aria-hidden className="h-6 w-6">
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06L8.674 12.26l6.97-6.97a.75.75 0 011.06 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </button>
            <span className="mt-2 text-sm font-medium text-[var(--color-text)]">{opt.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

function NameInput({
  initial,
  onSubmit,
}: {
  initial: string
  onSubmit: (v: string) => void
}) {
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 32

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(trimmed)
      }}
      className="mx-auto flex max-w-md flex-col gap-4"
    >
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Aria"
        maxLength={32}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-center text-2xl font-semibold text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-2 focus:ring-[var(--color-accent-strong)]/40"
      />

      <div className="flex flex-wrap justify-center gap-2">
        {NAME_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent-strong)]/40 hover:text-[var(--color-text)]"
          >
            {s}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={!valid}
        className="mt-4 w-full rounded-xl bg-[var(--color-accent-strong)] px-6 py-3.5 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Meet her →
      </button>
    </form>
  )
}

function RevealView({
  locale,
  choices,
}: {
  locale: string
  choices: OnboardingChoices
}) {
  const params = useMemo(() => {
    const sp = new URLSearchParams()
    Object.entries(choices).forEach(([k, v]) => {
      if (v) sp.set(k, v)
    })
    sp.set('from', 'onboarding')
    return sp.toString()
  }, [choices])

  const [previews, setPreviews] = useState<GeneratedPreview[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'generating' | 'ready' | 'error'>('generating')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false

    const run = async () => {
      const result = await generateGuestPreviewAction({
        appearance: choicesToAppearance(choices),
        language: (['en', 'ru', 'es'] as const).includes(locale as 'en' | 'ru' | 'es')
          ? (locale as 'en' | 'ru' | 'es')
          : 'en',
      })
      if (cancelled) return
      if (!result.ok) {
        setStatus('error')
        switch (result.error) {
          case 'rate_limited_hour':
            setErrorMessage("You've used your free previews for this hour. Try again later or sign up for unlimited.")
            break
          case 'rate_limited_day':
            setErrorMessage("You've reached today's free preview limit. Sign up to keep going.")
            break
          case 'preview_limit_reached':
            setErrorMessage("You've already generated previews. Pick one and continue.")
            break
          default:
            setErrorMessage('Generation failed. Please try again.')
        }
        return
      }
      setPreviews(result.previews.map((p) => ({ mediaAssetId: p.mediaAssetId, publicUrl: p.publicUrl })))
      const first = result.previews[0]
      if (first) {
        setSelectedId(first.mediaAssetId)
        // Persist initial selection so signup-claim has a reference picked.
        void selectGuestPreviewAction(first.mediaAssetId)
      }
      setStatus('ready')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [choices, locale])

  const handleSelect = async (mediaAssetId: string) => {
    setSelectedId(mediaAssetId)
    await selectGuestPreviewAction(mediaAssetId)
  }

  return (
    <div className="mt-8 flex flex-col items-center text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
        {status === 'generating' ? 'Bringing her to life...' : 'Your companion is ready'}
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
        Meet{' '}
        <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-strong)] bg-clip-text text-transparent">
          {choices.name || 'her'}
        </span>
      </h1>
      <p className="mt-2 max-w-md text-[var(--color-text-muted)]">
        {status === 'generating'
          ? 'Generating her photo — this takes 20–40 seconds. Worth the wait.'
          : 'She’s waiting for you. Create a free account to start chatting in under a minute.'}
      </p>

      <div className="mt-8">
        {status === 'ready' && previews.length > 0 ? (
          <RealPreviewGrid
            previews={previews}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-4">
            <CompanionPreview choices={choices} size="lg" />
            <p className="max-w-sm text-sm text-[var(--color-danger)]">{errorMessage}</p>
          </div>
        ) : (
          <div className="relative">
            <CompanionPreview choices={choices} size="lg" />
            <div className="absolute inset-0 grid place-items-center rounded-3xl bg-black/40 backdrop-blur-sm">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-accent-strong)]" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <a
          href={`/${locale}/signup?${params}`}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-6 py-3.5 font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
        >
          Claim {choices.name || 'her'}
        </a>
        <a
          href={`/${locale}/login?${params}`}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5 font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          I have an account
        </a>
      </div>

      <p className="mt-6 text-xs text-[var(--color-text-muted)]">
        Free forever · No credit card · Cancel anytime
      </p>
    </div>
  )
}

function RealPreviewGrid({
  previews,
  selectedId,
  onSelect,
}: {
  previews: GeneratedPreview[]
  selectedId: string | null
  onSelect: (mediaAssetId: string) => void
}) {
  if (previews.length === 1) {
    const only = previews[0]!
    return (
      <div className="relative aspect-[9/16] w-72 overflow-hidden rounded-3xl border-2 border-[var(--color-accent-strong)] shadow-[0_20px_50px_-12px_rgba(192,116,255,0.55)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={only.publicUrl} alt="Companion" className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {previews.map((p) => {
        const isSelected = selectedId === p.mediaAssetId
        return (
          <button
            key={p.mediaAssetId}
            type="button"
            onClick={() => onSelect(p.mediaAssetId)}
            className={[
              'relative aspect-[9/16] w-40 overflow-hidden rounded-2xl border-2 transition-all sm:w-48',
              isSelected
                ? 'border-[var(--color-accent-strong)] shadow-[0_18px_50px_-12px_rgba(192,116,255,0.55)]'
                : 'border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-text-muted)]',
            ].join(' ')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.publicUrl} alt="Companion preview" className="h-full w-full object-cover" />
            {isSelected && (
              <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-accent-strong)] text-[var(--color-bg)] shadow-lg">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06L8.674 12.26l6.97-6.97a.75.75 0 011.06 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
