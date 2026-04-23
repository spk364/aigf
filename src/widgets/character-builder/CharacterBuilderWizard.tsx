'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Button, Card, Input } from '@/shared/ui'
import {
  ART_STYLES,
  ETHNICITIES,
  AGE_RANGES,
  BODY_TYPES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  FEATURES,
  ARCHETYPES,
  MEET_SCENARIOS,
  RELATIONSHIP_STAGES,
} from '@/features/builder/options'
import { validateName } from '@/features/builder/blocklist'
import {
  saveDraftStepAction,
  generatePreviewsAction,
  selectReferenceAction,
  finalizeBuilderAction,
} from '@/features/builder/actions'

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

function t(strings: Record<string, unknown>, key: string): string {
  const parts = key.split('.')
  let cur: unknown = strings
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return key
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : key
}

const STEP_LABELS = [
  'builder.steps.appearance',
  'builder.steps.identity',
  'builder.steps.backstory',
  'builder.steps.review',
]

function StepIndicator({ current, total, strings }: { current: number; total: number; strings: Record<string, unknown> }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                i + 1 === current
                  ? 'bg-[var(--color-accent-strong)] text-[var(--color-bg)]'
                  : i + 1 < current
                    ? 'bg-[var(--color-accent-strong)]/40 text-[var(--color-text)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              ].join(' ')}
            >
              {i + 1}
            </div>
            <span
              className={[
                'hidden sm:block text-sm',
                i + 1 === current ? 'text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)]',
              ].join(' ')}
            >
              {t(strings, STEP_LABELS[i]!)}
            </span>
          </div>
          {i < total - 1 && (
            <div className={['flex-1 h-px', i + 1 < current ? 'bg-[var(--color-accent-strong)]/40' : 'bg-[var(--color-border)]'].join(' ')} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--color-text-muted)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function MultiSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  options: Array<{ value: string; label: string }>
}) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--color-text-muted)]">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={[
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              value.includes(o.value)
                ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/20 text-[var(--color-text)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
            ].join(' ')}
          >
            {o.label}
          </button>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--color-text-muted)]">{label}</label>
        <span className="text-xs text-[var(--color-text-muted)]">{value}/10</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-20 text-right text-xs text-[var(--color-text-muted)]">{leftLabel}</span>
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent-strong)]"
        />
        <span className="w-20 text-xs text-[var(--color-text-muted)]">{rightLabel}</span>
      </div>
    </div>
  )
}

type StepAppearanceProps = {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
  strings: Record<string, unknown>
  draftId: string
  previewGenerations: PreviewGeneration[]
  onPreviewsGenerated: (gens: PreviewGeneration[]) => void
  onReferenceSelected: (id: string) => void
  selectedReferenceId: string | null
}

function StepAppearance({
  data,
  onChange,
  strings,
  draftId,
  previewGenerations,
  onPreviewsGenerated,
  onReferenceSelected,
  selectedReferenceId,
}: StepAppearanceProps) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const hair = ((data.hair ?? {}) as Record<string, string>)
  const eyes = ((data.eyes ?? {}) as Record<string, string>)

  const previewCount = previewGenerations.length

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    const result = await generatePreviewsAction(draftId)
    setGenerating(false)
    if (!result.ok) {
      setGenError(result.error === 'preview_limit_reached' ? t(strings, 'builder.errors.previewLimitReached') : result.error)
      return
    }
    const newEntries: PreviewGeneration[] = result.previews.map((p) => ({
      mediaAssetId: String(p.mediaAssetId),
      promptUsed: '',
      generatedAt: new Date().toISOString(),
      selectedAsReference: false,
    }))
    onPreviewsGenerated([...previewGenerations, ...newEntries])
  }

  const handleSelectReference = async (mediaAssetId: string) => {
    await selectReferenceAction(draftId, mediaAssetId)
    onReferenceSelected(mediaAssetId)
  }

  return (
    <div className="flex flex-col gap-5">
      <SelectField
        label={t(strings, 'builder.fields.artStyle')}
        value={String(data.artStyle ?? '')}
        onChange={(v) => onChange({ ...data, artStyle: v })}
        options={ART_STYLES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />

      <MultiSelectField
        label={t(strings, 'builder.fields.ethnicity')}
        value={Array.isArray(data.ethnicity) ? (data.ethnicity as string[]) : []}
        onChange={(v) => onChange({ ...data, ethnicity: v })}
        options={ETHNICITIES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />

      <SelectField
        label={t(strings, 'builder.fields.ageRange')}
        value={String(data.ageRange ?? '')}
        onChange={(v) => {
          const range = AGE_RANGES.find((r) => r.value === v)
          onChange({ ...data, ageRange: v, ageDisplay: range?.defaultAge ?? 24 })
        }}
        options={AGE_RANGES.map((o) => ({ value: o.value, label: `${t(strings, o.labelKey)} (${o.rangeLabel})` }))}
      />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--color-text-muted)]">{t(strings, 'builder.fields.ageDisplay')}</label>
        <input
          type="number"
          min={21}
          max={99}
          value={typeof data.ageDisplay === 'number' ? data.ageDisplay : 24}
          onChange={(e) => onChange({ ...data, ageDisplay: Math.max(21, Number(e.target.value)) })}
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
        />
        <p className="text-xs text-[var(--color-text-muted)]">Min: 21</p>
      </div>

      <SelectField
        label={t(strings, 'builder.fields.bodyType')}
        value={String(data.bodyType ?? '')}
        onChange={(v) => onChange({ ...data, bodyType: v })}
        options={BODY_TYPES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SelectField
          label={t(strings, 'builder.fields.hairColor')}
          value={hair.color ?? ''}
          onChange={(v) => onChange({ ...data, hair: { ...hair, color: v } })}
          options={HAIR_COLORS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
        />
        <SelectField
          label={t(strings, 'builder.fields.hairLength')}
          value={hair.length ?? ''}
          onChange={(v) => onChange({ ...data, hair: { ...hair, length: v } })}
          options={HAIR_LENGTHS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
        />
        <SelectField
          label={t(strings, 'builder.fields.hairStyle')}
          value={hair.style ?? ''}
          onChange={(v) => onChange({ ...data, hair: { ...hair, style: v } })}
          options={HAIR_STYLES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
        />
      </div>

      <SelectField
        label={t(strings, 'builder.fields.eyeColor')}
        value={eyes.color ?? ''}
        onChange={(v) => onChange({ ...data, eyes: { ...eyes, color: v } })}
        options={EYE_COLORS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />

      <MultiSelectField
        label={t(strings, 'builder.fields.features')}
        value={Array.isArray(data.features) ? (data.features as string[]) : []}
        onChange={(v) => onChange({ ...data, features: v })}
        options={FEATURES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />

      <div className="border-t border-[var(--color-border)] pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-[var(--color-text)]">{t(strings, 'builder.actions.generatePreviews')}</p>
          <span className="text-xs text-[var(--color-text-muted)]">
            {t(strings, 'builder.previewsRemaining').replace('{used}', String(previewCount)).replace('{max}', '5')}
          </span>
        </div>

        {genError && (
          <p className="text-xs text-[var(--color-danger)] mb-3">{genError}</p>
        )}

        <Button
          onClick={handleGenerate}
          disabled={generating || previewCount >= 5}
          variant="secondary"
        >
          {generating ? '...' : t(strings, previewCount === 0 ? 'builder.actions.generatePreviews' : 'builder.actions.regenerate')}
        </Button>

        {previewGenerations.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {previewGenerations.flatMap((gen) => {
              const id = String(gen.mediaAssetId)
              const url = String(gen.publicUrl ?? '')
              if (!url) return []
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectReference(id)}
                  className={[
                    'relative overflow-hidden rounded-xl border-2 aspect-[3/4] transition-all',
                    selectedReferenceId === id
                      ? 'border-[var(--color-accent-strong)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent-strong)]/50',
                  ].join(' ')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Preview" className="w-full h-full object-cover" />
                  {selectedReferenceId === id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-accent-strong)]/20">
                      <span className="rounded-full bg-[var(--color-accent-strong)] px-2 py-0.5 text-xs text-[var(--color-bg)] font-semibold">
                        {t(strings, 'builder.actions.selectReference')}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

type StepIdentityProps = {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
  strings: Record<string, unknown>
}

function StepIdentity({ data, onChange, strings }: StepIdentityProps) {
  const name = String(data.name ?? '')
  const nameValidation = name.length > 0 ? validateName(name) : null

  const getNameError = () => {
    if (!nameValidation || nameValidation.ok) return undefined
    switch (nameValidation.reason) {
      case 'childlike': return t(strings, 'builder.errors.nameChildlike')
      case 'celebrity': return t(strings, 'builder.errors.nameCelebrity')
      case 'too_short': return t(strings, 'builder.errors.nameTooShort')
      case 'too_long': return t(strings, 'builder.errors.nameTooShort')
    }
  }

  const handleArchetypeSelect = (value: string) => {
    const archetype = ARCHETYPES.find((a) => a.value === value)
    onChange({
      ...data,
      archetype: value,
      traits: archetype?.defaultTraits ?? data.traits,
    })
  }

  const traits = (data.traits ?? {}) as Record<string, number>
  const selectedArchetype = ARCHETYPES.find((a) => a.value === String(data.archetype ?? ''))
  const defaultTraits = selectedArchetype?.defaultTraits ?? {
    shyBold: 5, playfulSerious: 5, submissiveDominant: 5,
    romanticCasual: 5, sweetSarcastic: 5, traditionalAdventurous: 5,
  }

  const getTraitValue = (key: string) => {
    if (typeof traits[key] === 'number') return traits[key]!
    return (defaultTraits as Record<string, number>)[key] ?? 5
  }

  return (
    <div className="flex flex-col gap-5">
      <Input
        id="builder-name"
        label={t(strings, 'builder.fields.name')}
        value={name}
        onChange={(e) => onChange({ ...data, name: e.target.value })}
        error={getNameError()}
        placeholder="e.g. Sophia"
        maxLength={40}
      />

      <Input
        id="builder-occupation"
        label={t(strings, 'builder.fields.occupation')}
        value={String(data.occupation ?? '')}
        onChange={(e) => onChange({ ...data, occupation: e.target.value })}
        placeholder="e.g. Nurse, Artist, Engineer"
        maxLength={80}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--color-text-muted)]">{t(strings, 'builder.fields.archetype')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ARCHETYPES.map((arch) => (
            <button
              key={arch.value}
              type="button"
              onClick={() => handleArchetypeSelect(arch.value)}
              className={[
                'rounded-xl border p-4 text-left transition-all',
                data.archetype === arch.value
                  ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/10'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent-strong)]/40',
              ].join(' ')}
            >
              <p className="text-sm font-medium text-[var(--color-text)]">{t(strings, arch.labelKey)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">{t(strings, 'builder.fields.personalityTraits')}</p>
        <SliderField
          label="Shyness"
          leftLabel="Shy"
          rightLabel="Bold"
          value={getTraitValue('shyBold')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, shyBold: v } })}
        />
        <SliderField
          label="Mood"
          leftLabel="Playful"
          rightLabel="Serious"
          value={getTraitValue('playfulSerious')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, playfulSerious: v } })}
        />
        <SliderField
          label="Stance"
          leftLabel="Submissive"
          rightLabel="Dominant"
          value={getTraitValue('submissiveDominant')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, submissiveDominant: v } })}
        />
        <SliderField
          label="Connection"
          leftLabel="Romantic"
          rightLabel="Casual"
          value={getTraitValue('romanticCasual')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, romanticCasual: v } })}
        />
        <SliderField
          label="Tone"
          leftLabel="Sweet"
          rightLabel="Sarcastic"
          value={getTraitValue('sweetSarcastic')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, sweetSarcastic: v } })}
        />
        <SliderField
          label="Lifestyle"
          leftLabel="Traditional"
          rightLabel="Adventurous"
          value={getTraitValue('traditionalAdventurous')}
          onChange={(v) => onChange({ ...data, traits: { ...traits, traditionalAdventurous: v } })}
        />
      </div>
    </div>
  )
}

type StepBackstoryProps = {
  data: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
  strings: Record<string, unknown>
}

function StepBackstory({ data, onChange, strings }: StepBackstoryProps) {
  const [interestInput, setInterestInput] = useState('')
  const interests = Array.isArray(data.interests) ? (data.interests as string[]) : []

  const addInterest = () => {
    const val = interestInput.trim()
    if (val && !interests.includes(val)) {
      onChange({ ...data, interests: [...interests, val] })
    }
    setInterestInput('')
  }

  const removeInterest = (i: string) => {
    onChange({ ...data, interests: interests.filter((x) => x !== i) })
  }

  const howYouMet = data.howYouMet
  const howYouMetValue =
    typeof howYouMet === 'object' && howYouMet !== null && 'custom' in (howYouMet as Record<string, unknown>)
      ? 'custom'
      : String(howYouMet ?? '')

  const customHowYouMet =
    typeof howYouMet === 'object' && howYouMet !== null && 'custom' in (howYouMet as Record<string, unknown>)
      ? String((howYouMet as { custom: string }).custom)
      : ''

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--color-text-muted)]" htmlFor="builder-bio">
          {t(strings, 'builder.fields.bio')}
        </label>
        <textarea
          id="builder-bio"
          value={String(data.bio ?? '')}
          onChange={(e) => onChange({ ...data, bio: e.target.value })}
          rows={5}
          maxLength={2000}
          placeholder="Write a short backstory..."
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
        />
        <p className="text-xs text-[var(--color-text-muted)]">{String(data.bio ?? '').length} / 2000</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--color-text-muted)]">{t(strings, 'builder.fields.interests')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInterest() } }}
            placeholder="e.g. hiking, cooking..."
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
          />
          <Button onClick={addInterest} variant="secondary" size="sm">Add</Button>
        </div>
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-sm text-[var(--color-text)]"
              >
                {interest}
                <button
                  type="button"
                  onClick={() => removeInterest(interest)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] ml-1"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--color-text-muted)]">{t(strings, 'builder.fields.howYouMet')}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MEET_SCENARIOS.map((scenario) => (
            <button
              key={scenario.value}
              type="button"
              onClick={() => onChange({ ...data, howYouMet: scenario.value === 'custom' ? { custom: customHowYouMet } : scenario.value })}
              className={[
                'rounded-xl border p-3 text-left text-sm transition-all',
                howYouMetValue === scenario.value
                  ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/10 text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              ].join(' ')}
            >
              {t(strings, scenario.labelKey)}
            </button>
          ))}
        </div>
        {howYouMetValue === 'custom' && (
          <input
            type="text"
            value={customHowYouMet}
            onChange={(e) => onChange({ ...data, howYouMet: { custom: e.target.value } })}
            placeholder="Describe how you met..."
            maxLength={200}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
          />
        )}
      </div>

      <SelectField
        label={t(strings, 'builder.fields.relationshipStage')}
        value={String(data.relationshipStage ?? '')}
        onChange={(v) => onChange({ ...data, relationshipStage: v })}
        options={RELATIONSHIP_STAGES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
      />
    </div>
  )
}

type StepReviewProps = {
  draftData: DraftData
  previewGenerations: PreviewGeneration[]
  strings: Record<string, unknown>
  onFinalize: () => Promise<void>
  finalizing: boolean
  finalizeError: string | null
}

function StepReview({ draftData, previewGenerations, strings, onFinalize, finalizing, finalizeError }: StepReviewProps) {
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const identity = (draftData.identity ?? {}) as Record<string, unknown>
  const backstory = (draftData.backstory ?? {}) as Record<string, unknown>
  const selectedId = draftData.selectedReferenceMediaAssetId

  const selectedPreview = previewGenerations.find((g) => String(g.mediaAssetId) === selectedId)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {selectedPreview && (
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={String(selectedPreview.publicUrl ?? '')}
              alt={String(identity.name ?? 'Character')}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--color-text)]">{String(identity.name ?? '—')}</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {String(identity.archetype ?? '').replace(/_/g, ' ')}
              {appearance.ageDisplay ? `, ${String(appearance.ageDisplay)}` : ''}
            </p>
          </div>

          {!!identity.occupation && (
            <p className="text-sm text-[var(--color-text)]">{String(identity.occupation)}</p>
          )}

          {!!backstory.bio && (
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-4">{String(backstory.bio).slice(0, 200)}</p>
          )}

          {Array.isArray(backstory.interests) && (backstory.interests as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(backstory.interests as string[]).map((i) => (
                <span key={i} className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {finalizeError && (
        <p className="text-sm text-[var(--color-danger)]">{finalizeError}</p>
      )}

      <Button onClick={onFinalize} disabled={finalizing} size="lg">
        {finalizing ? '...' : t(strings, 'builder.actions.meetHer')}
      </Button>
    </div>
  )
}

export function CharacterBuilderWizard({ draftId, initialDraft, strings }: Props) {
  const [currentStep, setCurrentStep] = useState(initialDraft.currentStep)
  const [draftData, setDraftData] = useState<DraftData>({
    appearance: (initialDraft.data.appearance as Record<string, unknown>) ?? {},
    identity: (initialDraft.data.identity as Record<string, unknown>) ?? {},
    backstory: (initialDraft.data.backstory as Record<string, unknown>) ?? {},
    selectedReferenceMediaAssetId: (initialDraft.data.selectedReferenceMediaAssetId as string | null) ?? null,
  })
  const [previewGenerations, setPreviewGenerations] = useState<PreviewGeneration[]>(
    initialDraft.previewGenerations as PreviewGeneration[],
  )
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback(
    (step: number, data: Record<string, unknown>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true)
        await saveDraftStepAction(draftId, step, data)
        setSaving(false)
      }, 600)
    },
    [draftId],
  )

  const handleAppearanceChange = (data: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, appearance: data }))
    scheduleSave(1, { appearance: data })
  }

  const handleIdentityChange = (data: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, identity: data }))
    scheduleSave(2, { identity: data })
  }

  const handleBackstoryChange = (data: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, backstory: data }))
    scheduleSave(3, { backstory: data })
  }

  const handleReferenceSelected = (id: string) => {
    setDraftData((prev) => ({ ...prev, selectedReferenceMediaAssetId: id }))
    setPreviewGenerations((prev) =>
      prev.map((g) => ({ ...g, selectedAsReference: String(g.mediaAssetId) === id })),
    )
  }

  const canNext = () => {
    if (currentStep === 1) return !!draftData.selectedReferenceMediaAssetId
    if (currentStep === 2) {
      const name = String(draftData.identity?.name ?? '')
      const v = name.length > 0 ? validateName(name) : { ok: false }
      return v.ok
    }
    if (currentStep === 3) return !!String(draftData.backstory?.bio ?? '').trim()
    return true
  }

  const handleNext = async () => {
    if (currentStep < 4) {
      const nextStep = currentStep + 1
      const stepDataMap: Record<number, Record<string, unknown>> = {
        1: { appearance: draftData.appearance },
        2: { identity: draftData.identity },
        3: { backstory: draftData.backstory },
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaving(true)
      await saveDraftStepAction(draftId, currentStep, stepDataMap[currentStep] ?? {})
      setSaving(false)
      setCurrentStep(nextStep)
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">{t(strings, 'builder.title')}</h1>

      <StepIndicator current={currentStep} total={4} strings={strings} />

      <Card className="mb-6">
        {currentStep === 1 && (
          <StepAppearance
            data={draftData.appearance ?? {}}
            onChange={handleAppearanceChange}
            strings={strings}
            draftId={draftId}
            previewGenerations={previewGenerations}
            onPreviewsGenerated={setPreviewGenerations}
            onReferenceSelected={handleReferenceSelected}
            selectedReferenceId={draftData.selectedReferenceMediaAssetId ?? null}
          />
        )}
        {currentStep === 2 && (
          <StepIdentity
            data={draftData.identity ?? {}}
            onChange={handleIdentityChange}
            strings={strings}
          />
        )}
        {currentStep === 3 && (
          <StepBackstory
            data={draftData.backstory ?? {}}
            onChange={handleBackstoryChange}
            strings={strings}
          />
        )}
        {currentStep === 4 && (
          <StepReview
            draftData={draftData}
            previewGenerations={previewGenerations}
            strings={strings}
            onFinalize={handleFinalize}
            finalizing={finalizing}
            finalizeError={finalizeError}
          />
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button
          onClick={handlePrev}
          disabled={currentStep === 1}
          variant="ghost"
        >
          {t(strings, 'builder.actions.prev')}
        </Button>

        <span className="text-xs text-[var(--color-text-muted)]">
          {saving ? t(strings, 'builder.actions.saveDraft') + '...' : ''}
        </span>

        {currentStep < 4 && (
          <Button
            onClick={handleNext}
            disabled={!canNext()}
          >
            {t(strings, 'builder.actions.next')}
          </Button>
        )}
      </div>
    </div>
  )
}
