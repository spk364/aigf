'use client'

import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Button, Card, Input } from '@/shared/ui'
import {
  ART_STYLES,
  ETHNICITIES,
  AGE_RANGES,
  BODY_TYPES,
  BREAST_SIZES,
  BUTT_SIZES,
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  FEATURES,
  ARCHETYPES,
  MEET_SCENARIOS,
  RELATIONSHIP_STAGES,
  type BuilderOption,
  type ArchetypeOption,
} from '@/features/builder/options'
import { validateName } from '@/features/builder/blocklist'
import {
  saveDraftStepAction,
  generatePreviewsAction,
  selectReferenceAction,
  finalizeBuilderAction,
} from '@/features/builder/actions'

// ── Types ──────────────────────────────────────────────────────────────────

type DraftData = {
  appearance?: Record<string, unknown>
  identity?: Record<string, unknown>
  backstory?: Record<string, unknown>
  selectedReferenceMediaAssetId?: string | null
}

type PreviewGeneration = {
  mediaAssetId: string
  publicUrl?: string
  promptUsed: string
  generatedAt: string
  selectedAsReference: boolean
}

type Props = {
  draftId: string
  initialDraft: {
    id: string
    currentStep: number
    data: Record<string, unknown>
    previewGenerations: Array<Record<string, unknown>>
    language: 'en' | 'ru' | 'es'
  }
  locale: 'en' | 'ru' | 'es'
  strings: Record<string, unknown>
}

// ── i18n helper ────────────────────────────────────────────────────────────

function t(strings: Record<string, unknown>, key: string, fallback?: string): string {
  const parts = key.split('.')
  let cur: unknown = strings
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return fallback ?? key
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : fallback ?? key
}

// ── Reusable image card ────────────────────────────────────────────────────

function OptionImageCard({
  option,
  label,
  selected,
  onClick,
  size = 'md',
}: {
  option: BuilderOption
  label: string
  selected: boolean
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const [imageOk, setImageOk] = useState(true)
  const aspect =
    size === 'sm' ? 'aspect-square' : size === 'lg' ? 'aspect-[3/4]' : 'aspect-[3/4]'

  const [from, to] = option.gradient ?? ['#5a5a6e', '#1a1a24']
  const bgStyle: React.CSSProperties = {
    background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)`,
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group relative overflow-hidden rounded-2xl border-2 transition-all text-left',
        aspect,
        selected
          ? 'border-[var(--color-accent-strong)] shadow-[0_0_0_4px_rgba(255,90,138,0.18)] scale-[1.02]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent-strong)]/60 hover:scale-[1.01]',
      ].join(' ')}
      style={bgStyle}
    >
      {/* Image overlay (falls back to gradient if missing) */}
      {option.imagePath && imageOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={option.imagePath}
          alt={label}
          loading="lazy"
          onError={() => setImageOk(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Emoji shown only when image is missing — keeps the card readable */}
      {(!option.imagePath || !imageOk) && option.emoji && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl opacity-90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {option.emoji}
          </span>
        </div>
      )}

      {/* Bottom gradient + label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-8 pb-3">
        <p className="text-sm font-semibold text-white drop-shadow leading-tight">
          {label}
        </p>
      </div>

      {/* Selected check badge */}
      {selected && (
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-white text-sm shadow-md">
          ✓
        </div>
      )}
    </button>
  )
}

// ── Generic question screens ───────────────────────────────────────────────

function QuestionHeader({
  title,
  hint,
}: {
  title: string
  hint?: string | null
}) {
  return (
    <div className="mb-6 text-center sm:text-left">
      <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">{title}</h2>
      {hint && (
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{hint}</p>
      )}
    </div>
  )
}

function SingleSelectGrid({
  title,
  hint,
  options,
  value,
  onChange,
  strings,
  columns = 3,
}: {
  title: string
  hint?: string
  options: BuilderOption[]
  value: string
  onChange: (v: string) => void
  strings: Record<string, unknown>
  columns?: 2 | 3 | 4
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'

  return (
    <div>
      <QuestionHeader title={title} hint={hint} />
      <div className={`grid ${colClass} gap-3`}>
        {options.map((o) => (
          <OptionImageCard
            key={o.value}
            option={o}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </div>
  )
}

function MultiSelectGrid({
  title,
  hint,
  options,
  values,
  onChange,
  strings,
  columns = 3,
}: {
  title: string
  hint?: string
  options: BuilderOption[]
  values: string[]
  onChange: (v: string[]) => void
  strings: Record<string, unknown>
  columns?: 2 | 3 | 4
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  return (
    <div>
      <QuestionHeader title={title} hint={hint} />
      <div className={`grid ${colClass} gap-3`}>
        {options.map((o) => (
          <OptionImageCard
            key={o.value}
            option={o}
            label={t(strings, o.labelKey)}
            selected={values.includes(o.value)}
            onClick={() => toggle(o.value)}
          />
        ))}
      </div>
    </div>
  )
}

function SliderField({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string
  leftLabel: string
  rightLabel: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-[var(--color-text)]">{label}</label>
        <span className="text-xs text-[var(--color-text-muted)]">{value}/10</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-24 text-right text-xs text-[var(--color-text-muted)] truncate">
          {leftLabel}
        </span>
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent-strong)]"
        />
        <span className="w-24 text-xs text-[var(--color-text-muted)] truncate">
          {rightLabel}
        </span>
      </div>
    </div>
  )
}

// ── Phase indicator (4 high-level phases) ─────────────────────────────────

const PHASE_KEYS: Array<'appearance' | 'identity' | 'backstory' | 'review'> = [
  'appearance',
  'identity',
  'backstory',
  'review',
]

function PhaseIndicator({
  currentPhase,
  strings,
}: {
  currentPhase: number
  strings: Record<string, unknown>
}) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {PHASE_KEYS.map((key, i) => {
        const idx = i + 1
        const isActive = idx === currentPhase
        const isDone = idx < currentPhase
        return (
          <React.Fragment key={key}>
            <div className="flex items-center gap-2">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-[var(--color-accent-strong)] text-white'
                    : isDone
                      ? 'bg-[var(--color-accent-strong)]/40 text-[var(--color-text)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {isDone ? '✓' : idx}
              </div>
              <span
                className={[
                  'hidden sm:block text-sm',
                  isActive
                    ? 'text-[var(--color-text)] font-medium'
                    : 'text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {t(strings, `builder.phases.${key}`, t(strings, `builder.steps.${key}`))}
              </span>
            </div>
            {i < PHASE_KEYS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px',
                  isDone ? 'bg-[var(--color-accent-strong)]/40' : 'bg-[var(--color-border)]',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Step descriptors ──────────────────────────────────────────────────────

type StepKey =
  | 'art_style'
  | 'ethnicity'
  | 'age'
  | 'skin_tone'
  | 'body_type'
  | 'breast_size'
  | 'butt_size'
  | 'hair_color'
  | 'hair_length'
  | 'hair_style'
  | 'eye_color'
  | 'features'
  | 'preview'
  | 'name'
  | 'archetype'
  | 'personality'
  | 'bio'
  | 'how_met'
  | 'review'

type StepDef = {
  key: StepKey
  phase: 1 | 2 | 3 | 4
}

const STEPS: StepDef[] = [
  { key: 'art_style', phase: 1 },
  { key: 'ethnicity', phase: 1 },
  { key: 'age', phase: 1 },
  { key: 'skin_tone', phase: 1 },
  { key: 'body_type', phase: 1 },
  { key: 'breast_size', phase: 1 },
  { key: 'butt_size', phase: 1 },
  { key: 'hair_color', phase: 1 },
  { key: 'hair_length', phase: 1 },
  { key: 'hair_style', phase: 1 },
  { key: 'eye_color', phase: 1 },
  { key: 'features', phase: 1 },
  { key: 'preview', phase: 1 },
  { key: 'name', phase: 2 },
  { key: 'archetype', phase: 2 },
  { key: 'personality', phase: 2 },
  { key: 'bio', phase: 3 },
  { key: 'how_met', phase: 3 },
  { key: 'review', phase: 4 },
]

// ── Identity / backstory / preview screens ────────────────────────────────

function PreviewScreen({
  strings,
  draftId,
  previewGenerations,
  selectedReferenceId,
  onPreviewsGenerated,
  onReferenceSelected,
}: {
  strings: Record<string, unknown>
  draftId: string
  previewGenerations: PreviewGeneration[]
  selectedReferenceId: string | null
  onPreviewsGenerated: (gens: PreviewGeneration[]) => void
  onReferenceSelected: (id: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const previewCount = previewGenerations.length

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    const result = await generatePreviewsAction(draftId)
    setGenerating(false)
    if (!result.ok) {
      setGenError(
        result.error === 'preview_limit_reached'
          ? t(strings, 'builder.errors.previewLimitReached')
          : result.error,
      )
      return
    }
    const newEntries: PreviewGeneration[] = result.previews.map((p) => ({
      mediaAssetId: String(p.mediaAssetId),
      publicUrl: p.publicUrl,
      promptUsed: '',
      generatedAt: new Date().toISOString(),
      selectedAsReference: false,
    }))
    onPreviewsGenerated([...previewGenerations, ...newEntries])
  }

  const handleSelect = async (id: string) => {
    await selectReferenceAction(draftId, id)
    onReferenceSelected(id)
  }

  return (
    <div>
      <QuestionHeader
        title={t(strings, 'builder.questions.preview')}
        hint={t(strings, 'builder.hints.previewIntro')}
      />

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[var(--color-text-muted)]">
          {t(strings, 'builder.previewsRemaining')
            .replace('{used}', String(previewCount))
            .replace('{max}', '5')}
        </span>
        <Button
          onClick={handleGenerate}
          disabled={generating || previewCount >= 5}
          variant="secondary"
          size="sm"
        >
          {generating
            ? '...'
            : t(
                strings,
                previewCount === 0
                  ? 'builder.actions.generatePreviews'
                  : 'builder.actions.regenerate',
              )}
        </Button>
      </div>

      {genError && <p className="text-xs text-[var(--color-danger)] mb-3">{genError}</p>}

      {previewGenerations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--color-border)] py-16 text-center text-sm text-[var(--color-text-muted)]">
          {t(strings, 'builder.actions.generatePreviews')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {previewGenerations.flatMap((gen) => {
            const id = String(gen.mediaAssetId)
            const url = String(gen.publicUrl ?? '')
            if (!url) return []
            const selected = selectedReferenceId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className={[
                  'relative overflow-hidden rounded-xl border-2 aspect-[3/4] transition-all',
                  selected
                    ? 'border-[var(--color-accent-strong)] shadow-[0_0_0_4px_rgba(255,90,138,0.18)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-strong)]/50',
                ].join(' ')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Preview" className="w-full h-full object-cover" />
                {selected && (
                  <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-white text-sm shadow-md">
                    ✓
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NameScreen({
  strings,
  identity,
  appearance,
  onChange,
  onAgeChange,
}: {
  strings: Record<string, unknown>
  identity: Record<string, unknown>
  appearance: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
  onAgeChange: (age: number) => void
}) {
  const name = String(identity.name ?? '')
  const nameValidation = name.length > 0 ? validateName(name) : null

  const getNameError = () => {
    if (!nameValidation || nameValidation.ok) return undefined
    switch (nameValidation.reason) {
      case 'childlike':
        return t(strings, 'builder.errors.nameChildlike')
      case 'celebrity':
        return t(strings, 'builder.errors.nameCelebrity')
      case 'too_short':
      case 'too_long':
        return t(strings, 'builder.errors.nameTooShort')
    }
  }

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.name')} />

      <div className="flex flex-col gap-4">
        <Input
          id="builder-name"
          label={t(strings, 'builder.fields.name')}
          value={name}
          onChange={(e) => onChange({ ...identity, name: e.target.value })}
          error={getNameError()}
          placeholder="Sophia, Mia, Anya..."
          maxLength={40}
        />

        <Input
          id="builder-occupation"
          label={`${t(strings, 'builder.fields.occupation')} (${t(strings, 'builder.hints.optional')})`}
          value={String(identity.occupation ?? '')}
          onChange={(e) => onChange({ ...identity, occupation: e.target.value })}
          placeholder="Nurse, Artist, Engineer..."
          maxLength={80}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-muted)]">
            {t(strings, 'builder.fields.ageDisplay')}
          </label>
          <input
            type="number"
            min={21}
            max={99}
            value={typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 24}
            onChange={(e) =>
              onAgeChange(Math.max(21, Math.min(99, Number(e.target.value))))
            }
            className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(strings, 'builder.hints.ageMin')}
          </p>
        </div>
      </div>
    </div>
  )
}

function ArchetypeScreen({
  strings,
  identity,
  onChange,
}: {
  strings: Record<string, unknown>
  identity: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const value = String(identity.archetype ?? '')

  const handleSelect = (v: string) => {
    const archetype = ARCHETYPES.find((a) => a.value === v) as ArchetypeOption | undefined
    onChange({
      ...identity,
      archetype: v,
      traits: archetype?.defaultTraits ?? identity.traits,
    })
  }

  return (
    <SingleSelectGrid
      title={t(strings, 'builder.questions.archetype')}
      hint={t(strings, 'builder.hints.singleSelect')}
      options={ARCHETYPES}
      value={value}
      onChange={handleSelect}
      strings={strings}
      columns={3}
    />
  )
}

function PersonalityScreen({
  strings,
  identity,
  onChange,
}: {
  strings: Record<string, unknown>
  identity: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const traits = (identity.traits ?? {}) as Record<string, number>
  const selectedArchetype = ARCHETYPES.find(
    (a) => a.value === String(identity.archetype ?? ''),
  )
  const defaultTraits = selectedArchetype?.defaultTraits ?? {
    shyBold: 5,
    playfulSerious: 5,
    submissiveDominant: 5,
    romanticCasual: 5,
    sweetSarcastic: 5,
    traditionalAdventurous: 5,
  }

  const getTraitValue = (key: string) => {
    if (typeof traits[key] === 'number') return traits[key]!
    return (defaultTraits as Record<string, number>)[key] ?? 5
  }

  const traitKeys = [
    'shyBold',
    'playfulSerious',
    'submissiveDominant',
    'romanticCasual',
    'sweetSarcastic',
    'traditionalAdventurous',
  ] as const

  return (
    <div>
      <QuestionHeader
        title={t(strings, 'builder.questions.personality')}
        hint={t(strings, 'builder.hints.optional')}
      />
      <div className="flex flex-col gap-5">
        {traitKeys.map((k) => (
          <SliderField
            key={k}
            label={t(strings, `builder.personality.${k}.label`)}
            leftLabel={t(strings, `builder.personality.${k}.left`)}
            rightLabel={t(strings, `builder.personality.${k}.right`)}
            value={getTraitValue(k)}
            onChange={(v) => onChange({ ...identity, traits: { ...traits, [k]: v } })}
          />
        ))}
      </div>
    </div>
  )
}

function BioScreen({
  strings,
  backstory,
  onChange,
}: {
  strings: Record<string, unknown>
  backstory: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const [interestInput, setInterestInput] = useState('')
  const interests = Array.isArray(backstory.interests) ? (backstory.interests as string[]) : []

  const addInterest = () => {
    const val = interestInput.trim()
    if (val && !interests.includes(val)) {
      onChange({ ...backstory, interests: [...interests, val] })
    }
    setInterestInput('')
  }

  const removeInterest = (i: string) => {
    onChange({ ...backstory, interests: interests.filter((x) => x !== i) })
  }

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.bio')} />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium text-[var(--color-text-muted)]"
            htmlFor="builder-bio"
          >
            {t(strings, 'builder.fields.bio')}
          </label>
          <textarea
            id="builder-bio"
            value={String(backstory.bio ?? '')}
            onChange={(e) => onChange({ ...backstory, bio: e.target.value })}
            rows={5}
            maxLength={2000}
            placeholder="A short, intimate backstory about her — who she is, what she's like, what she loves..."
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            {String(backstory.bio ?? '').length} / 2000
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--color-text-muted)]">
            {t(strings, 'builder.fields.interests')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addInterest()
                }
              }}
              placeholder="hiking, cooking, photography..."
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
            />
            <Button onClick={addInterest} variant="secondary" size="sm">
              +
            </Button>
          </div>
          {interests.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {interests.map((interest) => (
                <span
                  key={interest}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-sm text-[var(--color-text)]"
                >
                  {interest}
                  <button
                    type="button"
                    onClick={() => removeInterest(interest)}
                    className="ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HowMetScreen({
  strings,
  backstory,
  onChange,
}: {
  strings: Record<string, unknown>
  backstory: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const howYouMet = backstory.howYouMet
  const howYouMetValue =
    typeof howYouMet === 'object' && howYouMet !== null && 'custom' in (howYouMet as Record<string, unknown>)
      ? 'custom'
      : String(howYouMet ?? '')
  const customHowYouMet =
    typeof howYouMet === 'object' && howYouMet !== null && 'custom' in (howYouMet as Record<string, unknown>)
      ? String((howYouMet as { custom: string }).custom)
      : ''

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.howYouMet')} />

      <div className="flex flex-col gap-5">
        <div>
          <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">
            {t(strings, 'builder.fields.howYouMet')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MEET_SCENARIOS.map((scenario) => (
              <OptionImageCard
                key={scenario.value}
                option={scenario}
                label={t(strings, scenario.labelKey)}
                selected={howYouMetValue === scenario.value}
                onClick={() =>
                  onChange({
                    ...backstory,
                    howYouMet:
                      scenario.value === 'custom' ? { custom: customHowYouMet } : scenario.value,
                  })
                }
                size="sm"
              />
            ))}
          </div>
          {howYouMetValue === 'custom' && (
            <input
              type="text"
              value={customHowYouMet}
              onChange={(e) => onChange({ ...backstory, howYouMet: { custom: e.target.value } })}
              placeholder="Describe how you met..."
              maxLength={200}
              className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
            />
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">
            {t(strings, 'builder.fields.relationshipStage')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {RELATIONSHIP_STAGES.map((stage) => (
              <OptionImageCard
                key={stage.value}
                option={stage}
                label={t(strings, stage.labelKey)}
                selected={String(backstory.relationshipStage ?? '') === stage.value}
                onClick={() => onChange({ ...backstory, relationshipStage: stage.value })}
                size="sm"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewScreen({
  draftData,
  previewGenerations,
  strings,
  onFinalize,
  finalizing,
  finalizeError,
}: {
  draftData: DraftData
  previewGenerations: PreviewGeneration[]
  strings: Record<string, unknown>
  onFinalize: () => Promise<void>
  finalizing: boolean
  finalizeError: string | null
}) {
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const identity = (draftData.identity ?? {}) as Record<string, unknown>
  const backstory = (draftData.backstory ?? {}) as Record<string, unknown>
  const selectedId = draftData.selectedReferenceMediaAssetId
  const selectedPreview = previewGenerations.find((g) => String(g.mediaAssetId) === selectedId)

  return (
    <div className="flex flex-col gap-6">
      <QuestionHeader title={t(strings, 'builder.questions.review')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {selectedPreview && (
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={String(selectedPreview.publicUrl ?? '')}
              alt={String(identity.name ?? 'Character')}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {String(identity.name ?? '—')}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {String(identity.archetype ?? '').replace(/_/g, ' ')}
              {appearance.ageDisplay ? `, ${String(appearance.ageDisplay)}` : ''}
            </p>
          </div>

          {!!identity.occupation && (
            <p className="text-sm text-[var(--color-text)]">{String(identity.occupation)}</p>
          )}

          {!!backstory.bio && (
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-4">
              {String(backstory.bio).slice(0, 200)}
            </p>
          )}

          {Array.isArray(backstory.interests) && (backstory.interests as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(backstory.interests as string[]).map((i) => (
                <span
                  key={i}
                  className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                >
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {finalizeError && <p className="text-sm text-[var(--color-danger)]">{finalizeError}</p>}

      <Button onClick={onFinalize} disabled={finalizing} size="lg">
        {finalizing ? '...' : t(strings, 'builder.actions.meetHer')}
      </Button>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────

export function CharacterBuilderWizard({ draftId, initialDraft, strings }: Props) {
  const [draftData, setDraftData] = useState<DraftData>({
    appearance: (initialDraft.data.appearance as Record<string, unknown>) ?? {},
    identity: (initialDraft.data.identity as Record<string, unknown>) ?? {},
    backstory: (initialDraft.data.backstory as Record<string, unknown>) ?? {},
    selectedReferenceMediaAssetId:
      (initialDraft.data.selectedReferenceMediaAssetId as string | null) ?? null,
  })
  const [previewGenerations, setPreviewGenerations] = useState<PreviewGeneration[]>(
    initialDraft.previewGenerations as PreviewGeneration[],
  )

  // Sub-step index (local state). Resume from the start of the highest reached phase.
  const initialSubIdx = useMemo(() => {
    const phase = Math.max(1, Math.min(4, initialDraft.currentStep ?? 1))
    return STEPS.findIndex((s) => s.phase === phase)
  }, [initialDraft.currentStep])

  const [stepIdx, setStepIdx] = useState(initialSubIdx >= 0 ? initialSubIdx : 0)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentStep = STEPS[stepIdx]!
  const currentPhase = currentStep.phase

  const scheduleSave = useCallback(
    (phase: number, data: Record<string, unknown>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true)
        await saveDraftStepAction(draftId, phase, data)
        setSaving(false)
      }, 600)
    },
    [draftId],
  )

  const updateAppearance = (next: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, appearance: next }))
    scheduleSave(1, { appearance: next })
  }

  const updateIdentity = (next: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, identity: next }))
    scheduleSave(2, { identity: next })
  }

  const updateBackstory = (next: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, backstory: next }))
    scheduleSave(3, { backstory: next })
  }

  const handleReferenceSelected = (id: string) => {
    setDraftData((prev) => ({ ...prev, selectedReferenceMediaAssetId: id }))
    setPreviewGenerations((prev) =>
      prev.map((g) => ({ ...g, selectedAsReference: String(g.mediaAssetId) === id })),
    )
  }

  // ── Per-step gating ────────────────────────────────────────────────────
  const canAdvance = (): boolean => {
    const a = (draftData.appearance ?? {}) as Record<string, unknown>
    const i = (draftData.identity ?? {}) as Record<string, unknown>
    const b = (draftData.backstory ?? {}) as Record<string, unknown>
    const hair = (a.hair ?? {}) as Record<string, string>
    const eyes = (a.eyes ?? {}) as Record<string, string>

    switch (currentStep.key) {
      case 'art_style':
        return !!a.artStyle
      case 'ethnicity':
        return Array.isArray(a.ethnicity) && (a.ethnicity as string[]).length > 0
      case 'age':
        return !!a.ageRange
      case 'skin_tone':
        return !!a.skinTone
      case 'body_type':
        return !!a.bodyType
      case 'breast_size':
        return !!a.breastSize
      case 'butt_size':
        return !!a.buttSize
      case 'hair_color':
        return !!hair.color
      case 'hair_length':
        return !!hair.length
      case 'hair_style':
        return !!hair.style
      case 'eye_color':
        return !!eyes.color
      case 'features':
        return true // optional
      case 'preview':
        return !!draftData.selectedReferenceMediaAssetId
      case 'name': {
        const name = String(i.name ?? '')
        const v = name.length > 0 ? validateName(name) : { ok: false }
        return v.ok
      }
      case 'archetype':
        return !!i.archetype
      case 'personality':
        return true
      case 'bio':
        return !!String(b.bio ?? '').trim()
      case 'how_met':
        return !!b.relationshipStage && (typeof b.howYouMet === 'string' || (typeof b.howYouMet === 'object' && b.howYouMet !== null))
      case 'review':
        return true
    }
  }

  const goNext = async () => {
    if (stepIdx >= STEPS.length - 1) return
    const nextStep = STEPS[stepIdx + 1]!
    // Persist the current phase data when crossing a phase boundary
    if (nextStep.phase !== currentStep.phase) {
      const dataMap: Record<number, Record<string, unknown>> = {
        1: { appearance: draftData.appearance },
        2: { identity: draftData.identity },
        3: { backstory: draftData.backstory },
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaving(true)
      await saveDraftStepAction(draftId, currentStep.phase, dataMap[currentStep.phase] ?? {})
      setSaving(false)
    }
    setStepIdx(stepIdx + 1)
  }

  const goPrev = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    setFinalizeError(null)
    const result = await finalizeBuilderAction(draftId)
    if (result && !result.ok) {
      setFinalizeError(result.error)
      setFinalizing(false)
    }
  }

  // ── Render the current step ────────────────────────────────────────────
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const identity = (draftData.identity ?? {}) as Record<string, unknown>
  const backstory = (draftData.backstory ?? {}) as Record<string, unknown>
  const hair = (appearance.hair ?? {}) as Record<string, string>
  const eyes = (appearance.eyes ?? {}) as Record<string, string>

  const renderStep = () => {
    switch (currentStep.key) {
      case 'art_style':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.artStyle')}
            options={ART_STYLES}
            value={String(appearance.artStyle ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, artStyle: v })}
            strings={strings}
            columns={2}
          />
        )
      case 'ethnicity':
        return (
          <MultiSelectGrid
            title={t(strings, 'builder.questions.ethnicity')}
            hint={t(strings, 'builder.hints.multiSelect')}
            options={ETHNICITIES}
            values={Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []}
            onChange={(v) => updateAppearance({ ...appearance, ethnicity: v })}
            strings={strings}
            columns={3}
          />
        )
      case 'age':
        return (
          <div>
            <QuestionHeader title={t(strings, 'builder.questions.ageRange')} />
            <div className="grid grid-cols-2 gap-3">
              {AGE_RANGES.map((o) => (
                <OptionImageCard
                  key={o.value}
                  option={o}
                  label={`${t(strings, o.labelKey)} · ${o.rangeLabel}`}
                  selected={String(appearance.ageRange ?? '') === o.value}
                  onClick={() =>
                    updateAppearance({
                      ...appearance,
                      ageRange: o.value,
                      ageDisplay: o.defaultAge,
                    })
                  }
                />
              ))}
            </div>
          </div>
        )
      case 'skin_tone':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.skinTone')}
            options={SKIN_TONES}
            value={String(appearance.skinTone ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, skinTone: v })}
            strings={strings}
            columns={3}
          />
        )
      case 'body_type':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.bodyType')}
            options={BODY_TYPES}
            value={String(appearance.bodyType ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, bodyType: v })}
            strings={strings}
            columns={3}
          />
        )
      case 'breast_size':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.breastSize')}
            options={BREAST_SIZES}
            value={String(appearance.breastSize ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, breastSize: v })}
            strings={strings}
            columns={2}
          />
        )
      case 'butt_size':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.buttSize')}
            options={BUTT_SIZES}
            value={String(appearance.buttSize ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, buttSize: v })}
            strings={strings}
            columns={2}
          />
        )
      case 'hair_color':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.hairColor')}
            options={HAIR_COLORS}
            value={hair.color ?? ''}
            onChange={(v) =>
              updateAppearance({ ...appearance, hair: { ...hair, color: v } })
            }
            strings={strings}
            columns={4}
          />
        )
      case 'hair_length':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.hairLength')}
            options={HAIR_LENGTHS}
            value={hair.length ?? ''}
            onChange={(v) =>
              updateAppearance({ ...appearance, hair: { ...hair, length: v } })
            }
            strings={strings}
            columns={3}
          />
        )
      case 'hair_style':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.hairStyle')}
            options={HAIR_STYLES}
            value={hair.style ?? ''}
            onChange={(v) =>
              updateAppearance({ ...appearance, hair: { ...hair, style: v } })
            }
            strings={strings}
            columns={3}
          />
        )
      case 'eye_color':
        return (
          <SingleSelectGrid
            title={t(strings, 'builder.questions.eyeColor')}
            options={EYE_COLORS}
            value={eyes.color ?? ''}
            onChange={(v) =>
              updateAppearance({ ...appearance, eyes: { ...eyes, color: v } })
            }
            strings={strings}
            columns={4}
          />
        )
      case 'features':
        return (
          <MultiSelectGrid
            title={t(strings, 'builder.questions.features')}
            hint={`${t(strings, 'builder.hints.multiSelect')} · ${t(strings, 'builder.hints.optional')}`}
            options={FEATURES}
            values={Array.isArray(appearance.features) ? (appearance.features as string[]) : []}
            onChange={(v) => updateAppearance({ ...appearance, features: v })}
            strings={strings}
            columns={4}
          />
        )
      case 'preview':
        return (
          <PreviewScreen
            strings={strings}
            draftId={draftId}
            previewGenerations={previewGenerations}
            selectedReferenceId={draftData.selectedReferenceMediaAssetId ?? null}
            onPreviewsGenerated={setPreviewGenerations}
            onReferenceSelected={handleReferenceSelected}
          />
        )
      case 'name':
        return (
          <NameScreen
            strings={strings}
            identity={identity}
            appearance={appearance}
            onChange={updateIdentity}
            onAgeChange={(v) => updateAppearance({ ...appearance, ageDisplay: v })}
          />
        )
      case 'archetype':
        return <ArchetypeScreen strings={strings} identity={identity} onChange={updateIdentity} />
      case 'personality':
        return (
          <PersonalityScreen strings={strings} identity={identity} onChange={updateIdentity} />
        )
      case 'bio':
        return <BioScreen strings={strings} backstory={backstory} onChange={updateBackstory} />
      case 'how_met':
        return (
          <HowMetScreen strings={strings} backstory={backstory} onChange={updateBackstory} />
        )
      case 'review':
        return (
          <ReviewScreen
            draftData={draftData}
            previewGenerations={previewGenerations}
            strings={strings}
            onFinalize={handleFinalize}
            finalizing={finalizing}
            finalizeError={finalizeError}
          />
        )
    }
  }

  const stepCounter = t(strings, 'builder.stepCounter')
    .replace('{current}', String(stepIdx + 1))
    .replace('{total}', String(STEPS.length))

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
          {t(strings, 'builder.title')}
        </h1>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {stepCounter}
        </span>
      </div>

      <PhaseIndicator currentPhase={currentPhase} strings={strings} />

      <Card className="mb-6">{renderStep()}</Card>

      <div className="flex items-center justify-between">
        <Button onClick={goPrev} disabled={stepIdx === 0} variant="ghost">
          {t(strings, 'builder.actions.prev')}
        </Button>

        <span className="text-xs text-[var(--color-text-muted)]">
          {saving ? t(strings, 'builder.actions.saveDraft') + '...' : ''}
        </span>

        {currentStep.key !== 'review' && (
          <Button onClick={goNext} disabled={!canAdvance()}>
            {t(strings, 'builder.actions.next')}
          </Button>
        )}
      </div>
    </div>
  )
}
