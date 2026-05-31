'use client'

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button, Card, Input } from '@/shared/ui'
import {
  GENDERS,
  DESIGN_APPROACHES,
  ART_STYLES,
  ETHNICITIES,
  AGE_RANGES,
  BODY_TYPES,
  BREAST_SIZES,
  BUTT_SIZES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  ARCHETYPES,
  SEXUAL_ORIENTATIONS,
  CHAT_STYLES,
  OCCUPATIONS,
  STARTING_RELATIONSHIPS,
  KINKS,
  type BuilderOption,
  type ArchetypeOption,
} from '@/features/builder/options'
import { validateName } from '@/features/builder/blocklist'
import {
  saveDraftStepAction,
  submitPreviewJobAction,
  fetchPreviewJobStatusAction,
  selectReferenceAction,
  finalizeBuilderAction,
  suggestNameAction,
} from '@/features/builder/actions'
import {
  buildPreviewPrompt,
  buildPreviewNegativePrompt,
  buildUniquePrompt,
  resolveModelEndpoint,
  IMAGE_MODELS,
  type ModelOption,
} from '@/features/builder/prompt-builder'
import {
  parseUrlState,
  serializeUrlState,
  draftToUrlState,
  applyUrlStateToDraft,
} from '@/features/builder/url-state'

// ── Types ──────────────────────────────────────────────────────────────────

type DraftData = {
  pathChoice?: 'presets' | 'unique'
  appearance?: Record<string, unknown>
  identity?: Record<string, unknown>
  backstory?: Record<string, unknown>
  uniqueDesc?: Record<string, unknown>
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

      {(!option.imagePath || !imageOk) && option.emoji && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl opacity-90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {option.emoji}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-8 pb-3">
        <p className="text-sm font-semibold text-white drop-shadow leading-tight">
          {label}
        </p>
      </div>

      {selected && (
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-white text-sm shadow-md">
          ✓
        </div>
      )}
    </button>
  )
}

// Compact pill for joi-style chip rows (orientation, occupation, relationship).

function Chip({
  label,
  selected,
  onClick,
  emoji,
}: {
  label: string
  selected: boolean
  onClick: () => void
  emoji?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        selected
          ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15 text-[var(--color-text)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-strong)]/60 hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {label}
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

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-base font-semibold text-[var(--color-text)] mb-3 mt-1">{title}</h3>
  )
}

function SingleSelectGrid({
  options,
  value,
  onChange,
  strings,
  columns = 3,
}: {
  options: BuilderOption[]
  value: string
  onChange: (v: string) => void
  strings: Record<string, unknown>
  columns?: 2 | 3 | 4 | 5
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : columns === 4
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'

  return (
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
  steps,
  stepIdx,
  strings,
  onJumpToPhase,
}: {
  currentPhase: number
  steps: StepDef[]
  stepIdx: number
  strings: Record<string, unknown>
  // Click-to-navigate. Receives the phase number (1-4) and is expected to
  // move stepIdx to the first step of that phase. Forward jumps are
  // allowed — the canAdvance gating still keeps the user from finalising
  // a draft with unfilled required fields, so all this does is short-cut
  // navigation. Backwards jumps are always safe.
  onJumpToPhase?: (phase: number) => void
}) {
  // Compute position within the active phase so the user can tell that
  // they're moving forward even when they're walking through the five
  // sub-steps of "Appearance" — previously the indicator stayed pinned on
  // the same phase pill for the whole stretch and read as "stuck on
  // step 1".
  const activePhaseSteps = steps.filter((s) => s.phase === currentPhase)
  const activePhaseFirstIdx = steps.findIndex((s) => s.phase === currentPhase)
  const subIdx = Math.max(0, stepIdx - activePhaseFirstIdx)
  const subTotal = activePhaseSteps.length
  const progressPct = ((stepIdx + 1) / steps.length) * 100

  // The unique path skips identity (phase 2 maps to unique_desc) and
  // backstory (phase 3) — only show pills for phases that have at least
  // one step in the current path so we don't render dead "Personality" /
  // "Story" pills that go nowhere.
  const pathHasPhase = (phase: number) => steps.some((s) => s.phase === phase)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        {PHASE_KEYS.map((key, i) => {
          const idx = i + 1
          const isActive = idx === currentPhase
          const isDone = idx < currentPhase
          const isReachable = pathHasPhase(idx)
          const clickable = isReachable && !isActive && !!onJumpToPhase
          const PillTag = clickable ? 'button' : 'div'
          return (
            <React.Fragment key={key}>
              <PillTag
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => onJumpToPhase!(idx) : undefined}
                aria-label={clickable ? `Jump to ${t(strings, `builder.phases.${key}`)}` : undefined}
                className={[
                  'flex items-center gap-2 rounded-lg p-0.5 -m-0.5',
                  clickable
                    ? 'cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors'
                    : 'cursor-default',
                  !isReachable && 'opacity-40',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={clickable ? undefined : true}
              >
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
                <div className="hidden sm:flex flex-col leading-tight text-left">
                  <span
                    className={[
                      'text-sm',
                      isActive
                        ? 'text-[var(--color-text)] font-medium'
                        : 'text-[var(--color-text-muted)]',
                    ].join(' ')}
                  >
                    {t(strings, `builder.phases.${key}`)}
                  </span>
                  {isActive && subTotal > 1 && (
                    <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                      {subIdx + 1} / {subTotal}
                    </span>
                  )}
                </div>
              </PillTag>
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
      {/* Continuous progress bar across all sub-steps. Gives clear forward
          motion as the user walks through Appearance's 5 substeps — the
          phase pills alone don't show it. */}
      <div className="h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent-strong)] transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  )
}

// ── Step descriptors ──────────────────────────────────────────────────────

type StepKey =
  | 'intro'
  | 'unique_desc'
  | 'age_ethnicity'
  | 'body'
  | 'hair_eyes'
  | 'preview'
  | 'archetype'
  | 'name_orientation'
  | 'chat_style'
  | 'occupation'
  | 'relationship'
  | 'kinks'
  | 'review'

type StepDef = {
  key: StepKey
  phase: 1 | 2 | 3 | 4
}

// Two paths through the wizard. Picked dynamically based on draftData.pathChoice.
// Preview lives at the END of phase 3 (Story), after the user has picked
// archetype, occupation, and relationship. The previous position (after
// hair_eyes in phase 1) meant the prompt builder couldn't include
// archetype mood / occupation outfit on the first generation — the data
// was unfilled — so the user had to either generate a generic image and
// be disappointed, or navigate back to preview after answering identity.
// Moving preview to position 10 fixes that without splitting phases.
const PRESETS_STEPS: StepDef[] = [
  { key: 'intro', phase: 1 },
  { key: 'age_ethnicity', phase: 1 },
  { key: 'body', phase: 1 },
  { key: 'hair_eyes', phase: 1 },
  { key: 'archetype', phase: 2 },
  { key: 'name_orientation', phase: 2 },
  { key: 'chat_style', phase: 2 },
  { key: 'occupation', phase: 3 },
  { key: 'relationship', phase: 3 },
  { key: 'kinks', phase: 3 },
  { key: 'preview', phase: 3 },
  { key: 'review', phase: 4 },
]

const UNIQUE_STEPS: StepDef[] = [
  { key: 'intro', phase: 1 },
  { key: 'unique_desc', phase: 2 },
  { key: 'preview', phase: 2 },
  { key: 'review', phase: 4 },
]

// Same gating semantics as the runtime canAdvance() inside the component, but
// exposed as a pure function so the initial-step inference (initialSubIdx)
// can replay it across the persisted draft. Update in lockstep with
// canAdvance() — both encode the same per-step data prerequisite.
function isStepDataSatisfied(
  stepKey: StepKey,
  draft: {
    pathChoice?: 'presets' | 'unique'
    appearance?: Record<string, unknown>
    identity?: Record<string, unknown>
    backstory?: Record<string, unknown>
    uniqueDesc?: Record<string, unknown>
    selectedReferenceMediaAssetId?: string | null
  },
): boolean {
  const a = (draft.appearance ?? {}) as Record<string, unknown>
  const i = (draft.identity ?? {}) as Record<string, unknown>
  const b = (draft.backstory ?? {}) as Record<string, unknown>
  const u = (draft.uniqueDesc ?? {}) as Record<string, unknown>
  const hair = (a.hair ?? {}) as Record<string, string>
  const eyes = (a.eyes ?? {}) as Record<string, string>

  switch (stepKey) {
    case 'intro':
      return !!a.gender && !!a.artStyle && !!draft.pathChoice
    case 'unique_desc': {
      const name = String(u.name ?? '')
      return name.length >= 2 && validateName(name).ok && !!String(u.personality ?? '').trim()
    }
    case 'age_ethnicity':
      return !!a.ageRange && !!a.ethnicity
    case 'body':
      return !!a.bodyType && (a.gender === 'male' || !!a.breastSize) && !!a.buttSize
    case 'hair_eyes':
      return !!hair.style && !!hair.color && !!hair.length && !!eyes.color
    case 'preview':
      return !!draft.selectedReferenceMediaAssetId
    case 'archetype':
      return !!i.archetype
    case 'name_orientation': {
      const name = String(i.name ?? '')
      return name.length >= 2 && validateName(name).ok && !!i.sexualOrientation
    }
    case 'chat_style':
      return !!b.chatStyle
    case 'occupation':
      return (
        !!i.occupation &&
        (i.occupation !== 'custom' || !!String(i.occupationCustom ?? '').trim())
      )
    case 'relationship':
      return (
        !!b.startingRelationship &&
        (b.startingRelationship !== 'custom' ||
          !!String(b.startingRelationshipCustom ?? '').trim())
      )
    case 'kinks':
      return Array.isArray(b.kinks) // user reached this step (kinks are optional but the field gets initialised on entry)
    case 'review':
      return false // review has no "data" of its own — never claim it as the furthest step
  }
}

// Walk steps backwards and return the index of the highest step whose data
// prerequisite is satisfied. A returning user with a populated draft lands
// at their last position instead of getting bounced to the intro by a stale
// `step=0` URL or a phase-only currentStep fallback.
//
// Important: we start the walk at i=1, not i=0. The intro step's data
// (gender, artStyle, pathChoice) is pre-seeded by createDraftAction so a
// brand-new draft would otherwise satisfy intro's check and skip straight
// to age_ethnicity — the user would never see the realistic/anime picker.
// Only treat the draft as "past intro" when something further along has
// real user data.
function inferFurthestStepIdx(
  steps: StepDef[],
  draft: Parameters<typeof isStepDataSatisfied>[1],
): number {
  for (let i = steps.length - 1; i >= 1; i--) {
    if (isStepDataSatisfied(steps[i]!.key, draft)) {
      // If the user satisfied step N's data, they were at N+1 next (or review
      // if N is the last data step). Clamp to the last index so we never
      // overrun.
      return Math.min(i + 1, steps.length - 1)
    }
  }
  return 0
}

// ── Intro screen (gender + art style + path choice) ─────────────────────

function IntroScreen({
  strings,
  draftData,
  onChange,
}: {
  strings: Record<string, unknown>
  draftData: DraftData
  onChange: (d: DraftData) => void
}) {
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const gender = String(appearance.gender ?? 'female')
  const artStyle = String(appearance.artStyle ?? 'realistic')
  const pathChoice = String(draftData.pathChoice ?? 'presets')

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.intro')} />

      <SectionHeader title={t(strings, 'builder.sections.gender')} />
      <div className="flex gap-3 mb-6 justify-center">
        {GENDERS.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={gender === o.value}
            onClick={() => onChange({ ...draftData, appearance: { ...appearance, gender: o.value } })}
          />
        ))}
      </div>

      <SectionHeader title={t(strings, 'builder.sections.artStyle')} />
      <div className="grid grid-cols-2 gap-3 mb-6">
        {ART_STYLES.map((o) => (
          <OptionImageCard
            key={o.value}
            option={o}
            label={t(strings, o.labelKey)}
            selected={artStyle === o.value}
            onClick={() => onChange({ ...draftData, appearance: { ...appearance, artStyle: o.value } })}
          />
        ))}
      </div>

      <SectionHeader title={t(strings, 'builder.sections.approach')} />
      <div className="flex flex-wrap gap-3 justify-center">
        {DESIGN_APPROACHES.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={pathChoice === o.value}
            onClick={() => onChange({ ...draftData, pathChoice: o.value as 'presets' | 'unique' })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Age + ethnicity (presets path step 2) ────────────────────────────────

function AgeEthnicityScreen({
  strings,
  appearance,
  onChange,
}: {
  strings: Record<string, unknown>
  appearance: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const ageRange = String(appearance.ageRange ?? '')
  const ethnicity = String(appearance.ethnicity ?? '')

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.ageEthnicity')} />

      <SectionHeader title={t(strings, 'builder.sections.age')} />
      <div className="flex flex-wrap gap-2 mb-8">
        {AGE_RANGES.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={ageRange === o.value}
            onClick={() =>
              onChange({ ...appearance, ageRange: o.value, ageDisplay: o.defaultAge })
            }
          />
        ))}
      </div>

      <SectionHeader title={t(strings, 'builder.sections.ethnicity')} />
      <SingleSelectGrid
        options={ETHNICITIES}
        value={ethnicity}
        onChange={(v) => onChange({ ...appearance, ethnicity: v })}
        strings={strings}
        columns={3}
      />
    </div>
  )
}

// ── Body shape + breasts + butt ──────────────────────────────────────────

function BodyScreen({
  strings,
  appearance,
  onChange,
}: {
  strings: Record<string, unknown>
  appearance: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const isFemale = String(appearance.gender ?? 'female') !== 'male'

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.body')} />

      <SectionHeader title={t(strings, 'builder.sections.physique')} />
      <div className="mb-8">
        <SingleSelectGrid
          options={BODY_TYPES}
          value={String(appearance.bodyType ?? '')}
          onChange={(v) => onChange({ ...appearance, bodyType: v })}
          strings={strings}
          columns={5}
        />
      </div>

      {isFemale && (
        <>
          <SectionHeader title={t(strings, 'builder.sections.breasts')} />
          <div className="mb-8">
            <SingleSelectGrid
              options={BREAST_SIZES}
              value={String(appearance.breastSize ?? '')}
              onChange={(v) => onChange({ ...appearance, breastSize: v })}
              strings={strings}
              columns={5}
            />
          </div>
        </>
      )}

      <SectionHeader title={t(strings, 'builder.sections.butt')} />
      <SingleSelectGrid
        options={BUTT_SIZES}
        value={String(appearance.buttSize ?? '')}
        onChange={(v) => onChange({ ...appearance, buttSize: v })}
        strings={strings}
        columns={5}
      />
    </div>
  )
}

// ── Hair (style + length + color) + eyes ─────────────────────────────────

function HairEyesScreen({
  strings,
  appearance,
  onChange,
}: {
  strings: Record<string, unknown>
  appearance: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const hair = (appearance.hair ?? {}) as Record<string, string>
  const eyes = (appearance.eyes ?? {}) as Record<string, string>

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.hairEyes')} />

      <SectionHeader title={t(strings, 'builder.sections.hairStyle')} />
      <div className="mb-6">
        <SingleSelectGrid
          options={HAIR_STYLES}
          value={hair.style ?? ''}
          onChange={(v) => onChange({ ...appearance, hair: { ...hair, style: v } })}
          strings={strings}
          columns={4}
        />
      </div>

      <SectionHeader title={t(strings, 'builder.sections.hairLength')} />
      <div className="mb-6">
        <SingleSelectGrid
          options={HAIR_LENGTHS}
          value={hair.length ?? ''}
          onChange={(v) => onChange({ ...appearance, hair: { ...hair, length: v } })}
          strings={strings}
          columns={3}
        />
      </div>

      <SectionHeader title={t(strings, 'builder.sections.hairColor')} />
      <div className="flex flex-wrap gap-2 mb-8">
        {HAIR_COLORS.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={(hair.color ?? '') === o.value}
            onClick={() => onChange({ ...appearance, hair: { ...hair, color: o.value } })}
          />
        ))}
      </div>

      <SectionHeader title={t(strings, 'builder.sections.eyeColor')} />
      <SingleSelectGrid
        options={EYE_COLORS}
        value={eyes.color ?? ''}
        onChange={(v) => onChange({ ...appearance, eyes: { ...eyes, color: v } })}
        strings={strings}
        columns={4}
      />
    </div>
  )
}

// ── Preview generation step ───────────────────────────────────────────────

// Read-only prompt display with copy-to-clipboard. Surfaces the exact text
// the server is about to send to fal so the user can sanity-check / iterate
// before they spend a generation slot.
function PromptDisplay({
  label,
  value,
  strings,
  disabled,
}: {
  label: string
  value: string
  strings: Record<string, unknown>
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // navigator.clipboard isn't available over plain http or in some
      // sandboxed iframes — silently no-op rather than blowing up the UI.
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={disabled || !value}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
        >
          {copied
            ? t(strings, 'builder.actions.copiedPrompt', 'Copied')
            : t(strings, 'builder.actions.copyPrompt', 'Copy')}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        rows={Math.min(8, Math.max(3, Math.ceil(value.length / 80)))}
        disabled={disabled}
        className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs font-mono text-[var(--color-text)] disabled:opacity-50"
      />
    </div>
  )
}

// Pill row for picking the fal endpoint. We don't gate FLUX behind a
// premium flag here — the picker is just a transparent override of the
// art-style default; the rate limiter protects spend.
function ModelPicker({
  models,
  selectedEndpoint,
  artStyle,
  strings,
  onSelect,
}: {
  models: ModelOption[]
  selectedEndpoint: string
  artStyle: string
  strings: Record<string, unknown>
  onSelect: (endpoint: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        {t(strings, 'builder.modelPicker.heading', 'Image model')}
      </span>
      <div className="flex flex-wrap gap-2">
        {models.map((m) => {
          const selected = m.id === selectedEndpoint
          const isRecommended = m.recommendedFor.includes(artStyle as 'realistic' | 'anime')
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={[
                'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]/15'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent-strong)]/60',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                {t(strings, m.labelKey, m.id)}
                {isRecommended && (
                  <span className="rounded-md bg-[var(--color-accent-strong)]/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent-strong)]">
                    {t(strings, 'builder.modelPicker.recommended', 'Recommended')}
                  </span>
                )}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t(strings, m.descriptionKey, '')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// One labelled row of chip choices. Dense layout that fits multiple param
// rows on a single screen — meant to live inside CompactParamsEditor below.
function CompactChipRow({
  label,
  options,
  value,
  onChange,
  strings,
}: {
  label: string
  options: BuilderOption[]
  value: string | undefined
  onChange: (v: string) => void
  strings: Record<string, unknown>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </div>
  )
}

// Compact rewrite of the appearance/unique-desc steps so the user can
// tweak any choice without walking back through the wizard. Only renders
// the prompt-affecting fields; identity/backstory don't influence the
// image so we leave them in their dedicated steps.
function CompactParamsEditor({
  pathChoice,
  appearance,
  identity,
  uniqueDesc,
  strings,
  onAppearanceChange,
  onIdentityChange,
  onUniqueDescChange,
}: {
  pathChoice: string
  appearance: Record<string, unknown>
  // Optional — only call sites that pass `onIdentityChange` will see the
  // occupation row. The preview screen renders this editor before the user
  // has reached the identity step, so we keep it gated.
  identity?: Record<string, unknown>
  uniqueDesc: Record<string, unknown>
  strings: Record<string, unknown>
  onAppearanceChange: (next: Record<string, unknown>) => void
  onIdentityChange?: (next: Record<string, unknown>) => void
  onUniqueDescChange: (next: Record<string, unknown>) => void
}) {
  const isMale = appearance.gender === 'male'
  const hair = (appearance.hair ?? {}) as Record<string, string>
  const eyes = (appearance.eyes ?? {}) as Record<string, string>
  const id = identity ?? {}

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
      <CompactChipRow
        label={t(strings, 'builder.sections.gender')}
        options={GENDERS}
        value={String(appearance.gender ?? '')}
        onChange={(v) => onAppearanceChange({ ...appearance, gender: v })}
        strings={strings}
      />

      <CompactChipRow
        label={t(strings, 'builder.sections.artStyle')}
        options={ART_STYLES}
        value={String(appearance.artStyle ?? '')}
        onChange={(v) => onAppearanceChange({ ...appearance, artStyle: v })}
        strings={strings}
      />

      {pathChoice !== 'unique' && (
        <>
          <CompactChipRow
            label={t(strings, 'builder.sections.age')}
            options={AGE_RANGES}
            value={String(appearance.ageRange ?? '')}
            onChange={(v) => onAppearanceChange({ ...appearance, ageRange: v })}
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.ethnicity')}
            options={ETHNICITIES}
            value={String(appearance.ethnicity ?? '')}
            onChange={(v) => onAppearanceChange({ ...appearance, ethnicity: v })}
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.physique')}
            options={BODY_TYPES}
            value={String(appearance.bodyType ?? '')}
            onChange={(v) => onAppearanceChange({ ...appearance, bodyType: v })}
            strings={strings}
          />

          {!isMale && (
            <CompactChipRow
              label={t(strings, 'builder.sections.breasts')}
              options={BREAST_SIZES}
              value={String(appearance.breastSize ?? '')}
              onChange={(v) => onAppearanceChange({ ...appearance, breastSize: v })}
              strings={strings}
            />
          )}

          <CompactChipRow
            label={t(strings, 'builder.sections.butt')}
            options={BUTT_SIZES}
            value={String(appearance.buttSize ?? '')}
            onChange={(v) => onAppearanceChange({ ...appearance, buttSize: v })}
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.hairLength')}
            options={HAIR_LENGTHS}
            value={hair.length}
            onChange={(v) =>
              onAppearanceChange({ ...appearance, hair: { ...hair, length: v } })
            }
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.hairStyle')}
            options={HAIR_STYLES}
            value={hair.style}
            onChange={(v) =>
              onAppearanceChange({ ...appearance, hair: { ...hair, style: v } })
            }
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.hairColor')}
            options={HAIR_COLORS}
            value={hair.color}
            onChange={(v) =>
              onAppearanceChange({ ...appearance, hair: { ...hair, color: v } })
            }
            strings={strings}
          />

          <CompactChipRow
            label={t(strings, 'builder.sections.eyeColor')}
            options={EYE_COLORS}
            value={eyes.color}
            onChange={(v) =>
              onAppearanceChange({ ...appearance, eyes: { ...eyes, color: v } })
            }
            strings={strings}
          />

          {/* Occupation drives outfit AND scene/background — surfacing it
              in the compact editor lets the user retarget both with a
              single click without going back to the occupation step. */}
          {onIdentityChange && (
            <CompactChipRow
              label={t(strings, 'builder.questions.occupation', 'Occupation')}
              options={OCCUPATIONS.filter((o) => o.value !== 'custom')}
              value={String(id.occupation ?? '')}
              onChange={(v) => onIdentityChange({ ...id, occupation: v })}
              strings={strings}
            />
          )}
        </>
      )}

      {pathChoice === 'unique' && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              {t(strings, 'builder.sections.uniqueLooks')}
            </span>
            <textarea
              value={String(uniqueDesc.looks ?? '')}
              onChange={(e) => onUniqueDescChange({ ...uniqueDesc, looks: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder={t(strings, 'builder.placeholders.uniqueLooks')}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              {t(strings, 'builder.sections.uniquePersonality')}
            </span>
            <textarea
              value={String(uniqueDesc.personality ?? '')}
              onChange={(e) =>
                onUniqueDescChange({ ...uniqueDesc, personality: e.target.value })
              }
              rows={4}
              maxLength={2000}
              placeholder={t(strings, 'builder.placeholders.uniquePersonality')}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
            />
          </div>
        </>
      )}
    </div>
  )
}

function PreviewScreen({
  strings,
  draftId,
  pathChoice,
  appearance,
  identity,
  backstory,
  uniqueDesc,
  previewGenerations,
  selectedReferenceId,
  onAppearanceChange,
  onIdentityChange,
  onUniqueDescChange,
  onPreviewsGenerated,
  onReferenceSelected,
}: {
  strings: Record<string, unknown>
  draftId: string
  pathChoice: string
  appearance: Record<string, unknown>
  identity: Record<string, unknown>
  backstory: Record<string, unknown>
  uniqueDesc: Record<string, unknown>
  previewGenerations: PreviewGeneration[]
  selectedReferenceId: string | null
  onAppearanceChange: (next: Record<string, unknown>) => void
  onIdentityChange: (next: Record<string, unknown>) => void
  onUniqueDescChange: (next: Record<string, unknown>) => void
  onPreviewsGenerated: (gens: PreviewGeneration[]) => void
  onReferenceSelected: (id: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(true)

  // Each generation produces N images (numImages=4 server-side), all stamped
  // with the same generatedAt. Count distinct timestamps so the 5-set limit
  // means 5 user clicks, not 5 individual images. Without this the user gets
  // the Generate button disabled after the second click (8 entries > 5),
  // even though they only ran two generations.
  const generationCount = useMemo(
    () => new Set(previewGenerations.map((g) => g.generatedAt).filter(Boolean)).size,
    [previewGenerations],
  )
  const PREVIEW_GEN_LIMIT = 5
  const limitReached = generationCount >= PREVIEW_GEN_LIMIT

  // Recompute the live prompt whenever the user tweaks anything in the
  // compact editor — the textarea below mirrors what the server will send.
  // Pass identity + backstory so archetype mood and occupation outfit show
  // up in the preview (and in the rendered image once Generate fires).
  const prompt = useMemo(
    () =>
      pathChoice === 'unique'
        ? buildUniquePrompt(uniqueDesc, appearance)
        : buildPreviewPrompt(appearance, identity, backstory),
    [pathChoice, uniqueDesc, appearance, identity, backstory],
  )
  const negativePrompt = useMemo(() => buildPreviewNegativePrompt(appearance), [appearance])
  const selectedEndpoint = useMemo(
    () =>
      resolveModelEndpoint(
        typeof appearance.modelEndpoint === 'string'
          ? (appearance.modelEndpoint as string)
          : null,
        String(appearance.artStyle ?? 'realistic'),
      ),
    [appearance],
  )
  const selectedModel = IMAGE_MODELS.find((m) => m.id === selectedEndpoint)
  const supportsNegative = selectedModel?.supportsNegativePrompt ?? true

  // Live progress message while the poll loop is running ("Queue: 3 · …").
  // Surfaces fal's queue_position and last log line so the user sees that
  // the wizard is actually waiting on the model, not stalled. Cleared when
  // the loop ends (success / error / unmount).
  const [genProgress, setGenProgress] = useState<string | null>(null)
  // Cancel flag — flipped on component unmount so an orphaned polling
  // loop doesn't try to setState on a dead component (or keep burning
  // server-action invocations forever).
  const generationCancelRef = useRef(false)
  useEffect(() => {
    return () => {
      generationCancelRef.current = true
    }
  }, [])

  // Map a server-side error code to a localised message. Falls back to the
  // raw text when we don't recognise the code so admins still see the real
  // cause during debugging.
  const mapGenError = (code: string): string => {
    switch (code) {
      case 'preview_limit_reached':
        return t(strings, 'builder.errors.previewLimitReached')
      case 'safety_filtered':
        return t(strings, 'builder.errors.previewSafetyFiltered')
      case 'poll_timed_out':
      case 'rate_limited':
        return t(
          strings,
          'builder.errors.previewTimeout',
          'Generation timed out. Try a faster model or wait — Pony/Illustrious checkpoints warm up after the first hit.',
        )
      default:
        return code
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    setGenProgress(null)
    generationCancelRef.current = false
    try {
      // Phase 1: submit to fal. Returns immediately with handles persisted
      // server-side on draft.data.pendingPreviewJob.
      const submit = await submitPreviewJobAction(draftId)
      if (!submit.ok) {
        setGenError(mapGenError(submit.error))
        return
      }
      // Phase 2: poll status every ~3 s until completed / failed / cancelled.
      // Server enforces a 4-min deadline (POLL_DEADLINE_MS) so this loop can
      // only run that long even if we forget to break out.
      let pollDelayMs = 3000
      while (!generationCancelRef.current) {
        await new Promise((r) => setTimeout(r, pollDelayMs))
        if (generationCancelRef.current) return
        const poll = await fetchPreviewJobStatusAction(draftId)
        if (!poll.ok) {
          setGenError(mapGenError(poll.error))
          return
        }
        if (poll.status === 'completed') {
          const newEntry: PreviewGeneration = {
            mediaAssetId: String(poll.preview.mediaAssetId),
            publicUrl: poll.preview.publicUrl,
            promptUsed: '',
            generatedAt: new Date().toISOString(),
            selectedAsReference: false,
          }
          onPreviewsGenerated([...previewGenerations, newEntry])
          return
        }
        // status === 'pending' — surface what fal told us so the user sees
        // motion. queueMsg/logMsg may both be empty during the brief window
        // before fal returns a status payload.
        const queueMsg =
          typeof poll.queuePosition === 'number' && poll.queuePosition > 0
            ? `Queue: ${poll.queuePosition}`
            : ''
        const logMsg = poll.lastLog ?? ''
        setGenProgress([queueMsg, logMsg].filter(Boolean).join(' · ') || 'Waiting…')
        // Back off slightly after the first few polls — cold-start LoRAs
        // sit in fal's queue for minutes; hitting the status URL every 3s
        // for that long is just noise.
        if (pollDelayMs < 6000) pollDelayMs = Math.min(6000, pollDelayMs + 500)
      }
    } catch (e) {
      // submit/poll action threw something the typed return shape didn't
      // cover (network drop, etc.). Treat as timeout so the user sees a
      // clear hint instead of "Failed to fetch".
      setGenError(
        t(strings, 'builder.errors.previewTimeout', 'Generation timed out.'),
      )
      console.error('[builder-preview]', e)
    } finally {
      setGenerating(false)
      setGenProgress(null)
    }
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

      {/* Compact param editor — collapsed by default to keep the screen
          short for users who are happy with their picks. */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setParamsOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-strong)]/60"
        >
          <span>
            {paramsOpen
              ? t(strings, 'builder.actions.hideParams', 'Hide parameters')
              : t(strings, 'builder.actions.editParams', 'Edit parameters')}
          </span>
          <span aria-hidden>{paramsOpen ? '▴' : '▾'}</span>
        </button>
        {paramsOpen && (
          <div className="mt-3">
            <CompactParamsEditor
              pathChoice={pathChoice}
              appearance={appearance}
              identity={identity}
              uniqueDesc={uniqueDesc}
              strings={strings}
              onAppearanceChange={onAppearanceChange}
              onIdentityChange={onIdentityChange}
              onUniqueDescChange={onUniqueDescChange}
            />
          </div>
        )}
      </div>

      <div className="mb-4">
        {/* onSelect only updates appearance.modelEndpoint and triggers a
            debounced draft save (saveDraftStepAction). It does NOT call
            generatePreviewsAction — image generation only fires from the
            Generate button click below (handleGenerate). */}
        <ModelPicker
          models={IMAGE_MODELS}
          selectedEndpoint={selectedEndpoint}
          artStyle={String(appearance.artStyle ?? 'realistic')}
          strings={strings}
          onSelect={(endpoint) => onAppearanceChange({ ...appearance, modelEndpoint: endpoint })}
        />
      </div>

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-strong)]/60"
        >
          <span>
            {promptOpen
              ? t(strings, 'builder.actions.hidePrompt', 'Hide prompt')
              : t(strings, 'builder.actions.showPrompt', 'Show final prompt')}
          </span>
          <span aria-hidden>{promptOpen ? '▴' : '▾'}</span>
        </button>
        {promptOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <PromptDisplay
              label={t(strings, 'builder.promptPreview.positive', 'Prompt')}
              value={prompt}
              strings={strings}
            />
            <div>
              <PromptDisplay
                label={t(strings, 'builder.promptPreview.negative', 'Negative prompt')}
                value={negativePrompt}
                strings={strings}
                disabled={!supportsNegative}
              />
              {!supportsNegative && (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t(
                    strings,
                    'builder.promptPreview.negativeUnsupported',
                    'This model ignores negative prompts.',
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[var(--color-text-muted)]">
          {t(strings, 'builder.previewsRemaining')
            .replace('{used}', String(generationCount))
            .replace('{max}', String(PREVIEW_GEN_LIMIT))}
        </span>
        <Button
          onClick={handleGenerate}
          disabled={generating || limitReached}
          variant="secondary"
          size="sm"
        >
          {generating
            ? '...'
            : t(
                strings,
                generationCount === 0
                  ? 'builder.actions.generatePreviews'
                  : 'builder.actions.regenerate',
              )}
        </Button>
      </div>

      {/* Live poll progress so cold-start LoRAs (2-3 min) don't look stalled. */}
      {generating && genProgress && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3 tabular-nums">
          {genProgress}
        </p>
      )}

      {/* Surface the disabled-by-limit state so the button doesn't just sit
          dead with no explanation. */}
      {limitReached && !genError && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          {t(strings, 'builder.errors.previewLimitReached')}
        </p>
      )}
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

// ── Archetype + 5 sliders ────────────────────────────────────────────────

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
  const traits = (identity.traits ?? {}) as Record<string, number>

  // Custom is implicit when no preset is picked AND user has touched sliders.
  const isCustom = value === 'custom'

  const handleSelect = (v: string) => {
    if (v === 'custom') {
      onChange({ ...identity, archetype: 'custom', traits: traits ?? {} })
      return
    }
    const archetype = ARCHETYPES.find((a) => a.value === v) as ArchetypeOption | undefined
    onChange({
      ...identity,
      archetype: v,
      traits: archetype?.defaultTraits ?? identity.traits,
    })
  }

  const traitKeys = ['dominant', 'confident', 'passionate', 'outgoing', 'playful'] as const

  const customOption: BuilderOption = {
    value: 'custom',
    labelKey: 'builder.options.archetype.custom',
    emoji: '✨',
    gradient: ['#a3b6cc', '#0f1a26'],
  }

  return (
    <div>
      <QuestionHeader
        title={t(strings, 'builder.questions.archetype')}
        hint={t(strings, 'builder.hints.singleSelect')}
      />
      <SingleSelectGrid
        options={[...ARCHETYPES, customOption]}
        value={value}
        onChange={handleSelect}
        strings={strings}
        columns={3}
      />

      {isCustom && (
        <div className="mt-6 flex flex-col gap-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t(strings, 'builder.hints.customSliders')}
          </p>
          {traitKeys.map((k) => (
            <SliderField
              key={k}
              label={t(strings, `builder.personality.${k}.label`)}
              leftLabel={t(strings, `builder.personality.${k}.left`)}
              rightLabel={t(strings, `builder.personality.${k}.right`)}
              value={typeof traits[k] === 'number' ? traits[k]! : 5}
              onChange={(v) => onChange({ ...identity, traits: { ...traits, [k]: v } })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Name + sexual orientation ─────────────────────────────────────────────

function NameOrientationScreen({
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
  const orientation = String(identity.sexualOrientation ?? '')
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

  const handleSuggest = async () => {
    const ethnicity = String(appearance.ethnicity ?? 'european')
    const gender = String(appearance.gender ?? 'female') as 'female' | 'male'
    const result = await suggestNameAction(ethnicity, gender)
    onChange({ ...identity, name: result.name })
  }

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.nameOrientation')} />

      <SectionHeader title={t(strings, 'builder.sections.name')} />
      <div className="mb-6 flex gap-2">
        <div className="flex-1">
          <Input
            id="builder-name"
            value={name}
            onChange={(e) => onChange({ ...identity, name: e.target.value })}
            error={getNameError()}
            placeholder="Sophia, Mia, Anya..."
            maxLength={40}
          />
        </div>
        <Button onClick={handleSuggest} variant="secondary" size="sm">
          ↻
        </Button>
      </div>

      <SectionHeader title={t(strings, 'builder.sections.ageDisplay')} />
      <div className="mb-6 flex flex-col gap-1.5">
        <input
          type="number"
          min={18}
          max={99}
          value={typeof appearance.ageDisplay === 'number' ? appearance.ageDisplay : 22}
          onChange={(e) =>
            onAgeChange(Math.max(18, Math.min(99, Number(e.target.value))))
          }
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
        />
        <p className="text-xs text-[var(--color-text-muted)]">
          {t(strings, 'builder.hints.ageMin')}
        </p>
      </div>

      <SectionHeader title={t(strings, 'builder.sections.orientation')} />
      <div className="flex flex-wrap gap-2">
        {SEXUAL_ORIENTATIONS.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={orientation === o.value}
            onClick={() => onChange({ ...identity, sexualOrientation: o.value })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Chat style ────────────────────────────────────────────────────────────

const CHAT_STYLE_EXAMPLES: Record<string, { question: string; reply: string }> = {
  default: {
    question: 'How was your day?',
    reply: 'Long. But it just got better — you texted me. What about you?',
  },
  deep_roleplay: {
    question: 'How was your day?',
    reply: '*sets down the mug, leans on the counter, eyes finding yours* Honestly? Half of it was wasted not thinking about you. The other half was thinking about you. Tell me about yours.',
  },
  creative: {
    question: 'How was your day?',
    reply: 'Today was a slow song with the volume down — until you. Now it sounds like a chorus. How did you survive yours?',
  },
  realistic: {
    question: 'How was your day?',
    reply: 'mehhh. tired tbh. yours?? 🥺',
  },
}

function ChatStyleScreen({
  strings,
  backstory,
  onChange,
}: {
  strings: Record<string, unknown>
  backstory: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const value = String(backstory.chatStyle ?? 'default')
  const example = CHAT_STYLE_EXAMPLES[value] ?? CHAT_STYLE_EXAMPLES.default!

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.chatStyle')} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {CHAT_STYLES.map((o) => (
          <OptionImageCard
            key={o.value}
            option={o}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange({ ...backstory, chatStyle: o.value })}
          />
        ))}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
          {t(strings, 'builder.hints.example')}
        </p>
        <div className="rounded-lg bg-[var(--color-surface)] px-3 py-2 mb-2 text-sm text-[var(--color-text)] inline-block">
          {example.question}
        </div>
        <div className="rounded-lg bg-[var(--color-accent-strong)]/15 px-3 py-2 text-sm text-[var(--color-text)] mt-1">
          {example.reply}
        </div>
      </div>
    </div>
  )
}

// ── Occupation ────────────────────────────────────────────────────────────

function OccupationScreen({
  strings,
  identity,
  onChange,
}: {
  strings: Record<string, unknown>
  identity: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const value = String(identity.occupation ?? '')
  const custom = String(identity.occupationCustom ?? '')

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.occupation')} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {OCCUPATIONS.slice(0, 4).map((o) => (
          <OptionImageCard
            key={o.value}
            option={o}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange({ ...identity, occupation: o.value })}
            size="sm"
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {OCCUPATIONS.slice(4).map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange({ ...identity, occupation: o.value })}
          />
        ))}
      </div>

      {value === 'custom' && (
        <input
          type="text"
          value={custom}
          onChange={(e) => onChange({ ...identity, occupationCustom: e.target.value })}
          placeholder={t(strings, 'builder.placeholders.occupationCustom')}
          maxLength={80}
          className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
        />
      )}
    </div>
  )
}

// ── Starting relationship ────────────────────────────────────────────────

function RelationshipScreen({
  strings,
  backstory,
  onChange,
}: {
  strings: Record<string, unknown>
  backstory: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const value = String(backstory.startingRelationship ?? '')
  const custom = String(backstory.startingRelationshipCustom ?? '')

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.relationship')} />

      <div className="flex flex-wrap gap-2">
        {STARTING_RELATIONSHIPS.map((o) => (
          <Chip
            key={o.value}
            emoji={o.emoji}
            label={t(strings, o.labelKey)}
            selected={value === o.value}
            onClick={() => onChange({ ...backstory, startingRelationship: o.value })}
          />
        ))}
      </div>

      {value === 'custom' && (
        <input
          type="text"
          value={custom}
          onChange={(e) => onChange({ ...backstory, startingRelationshipCustom: e.target.value })}
          placeholder={t(strings, 'builder.placeholders.relationshipCustom')}
          maxLength={120}
          className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
        />
      )}
    </div>
  )
}

// ── Kinks (multi-select with search) ─────────────────────────────────────

function KinksScreen({
  strings,
  backstory,
  onChange,
}: {
  strings: Record<string, unknown>
  backstory: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const values = Array.isArray(backstory.kinks) ? (backstory.kinks as string[]) : []
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = KINKS
    if (q) {
      list = list.filter((k) => t(strings, k.labelKey).toLowerCase().includes(q))
    }
    return showAll ? list : list.slice(0, 15)
  }, [search, showAll, strings])

  const toggle = (v: string) => {
    onChange({
      ...backstory,
      kinks: values.includes(v) ? values.filter((x) => x !== v) : [...values, v],
    })
  }

  return (
    <div>
      <QuestionHeader
        title={t(strings, 'builder.questions.kinks')}
        hint={t(strings, 'builder.hints.optional')}
      />

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(strings, 'builder.placeholders.kinkSearch')}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)]"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {filtered.map((k) => (
          <Chip
            key={k.value}
            emoji={k.emoji}
            label={t(strings, k.labelKey)}
            selected={values.includes(k.value)}
            onClick={() => toggle(k.value)}
          />
        ))}
      </div>

      {!showAll && KINKS.length > 15 && search.trim() === '' && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
        >
          {t(strings, 'builder.actions.showMore').replace('{count}', String(KINKS.length - 15))}
        </button>
      )}
    </div>
  )
}

// ── Unique-description path (single combined screen) ────────────────────

function UniqueDescScreen({
  strings,
  uniqueDesc,
  appearance,
  onChange,
}: {
  strings: Record<string, unknown>
  uniqueDesc: Record<string, unknown>
  appearance: Record<string, unknown>
  onChange: (d: Record<string, unknown>) => void
}) {
  const name = String(uniqueDesc.name ?? '')
  const personality = String(uniqueDesc.personality ?? '')
  const looks = String(uniqueDesc.looks ?? '')
  const nameValidation = name.length > 0 ? validateName(name) : null

  const getNameError = () => {
    if (!nameValidation || nameValidation.ok) return undefined
    switch (nameValidation.reason) {
      case 'childlike':
        return t(strings, 'builder.errors.nameChildlike')
      case 'celebrity':
        return t(strings, 'builder.errors.nameCelebrity')
      default:
        return t(strings, 'builder.errors.nameTooShort')
    }
  }

  const handleSuggest = async () => {
    const ethnicity = String(appearance.ethnicity ?? 'european')
    const gender = String(appearance.gender ?? 'female') as 'female' | 'male'
    const result = await suggestNameAction(ethnicity, gender)
    onChange({ ...uniqueDesc, name: result.name })
  }

  return (
    <div>
      <QuestionHeader title={t(strings, 'builder.questions.uniqueDesc')} />

      <SectionHeader title={t(strings, 'builder.sections.name')} />
      <div className="mb-5 flex gap-2">
        <div className="flex-1">
          <Input
            id="builder-unique-name"
            value={name}
            onChange={(e) => onChange({ ...uniqueDesc, name: e.target.value })}
            error={getNameError()}
            placeholder="Sophia, Mia, Anya..."
            maxLength={40}
          />
        </div>
        <Button onClick={handleSuggest} variant="secondary" size="sm">
          ↻
        </Button>
      </div>

      <SectionHeader title={t(strings, 'builder.sections.uniquePersonality')} />
      <textarea
        value={personality}
        onChange={(e) => onChange({ ...uniqueDesc, personality: e.target.value })}
        rows={5}
        maxLength={2000}
        placeholder={t(strings, 'builder.placeholders.uniquePersonality')}
        className="w-full mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
      />

      <SectionHeader title={t(strings, 'builder.sections.uniqueLooks')} />
      <textarea
        value={looks}
        onChange={(e) => onChange({ ...uniqueDesc, looks: e.target.value })}
        rows={5}
        maxLength={2000}
        placeholder={t(strings, 'builder.placeholders.uniqueLooks')}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] resize-y"
      />
    </div>
  )
}

// ── Review / finalize ────────────────────────────────────────────────────

function ReviewScreen({
  draftData,
  previewGenerations,
  strings,
  onAppearanceChange,
  onIdentityChange,
  onUniqueDescChange,
  onFinalize,
  finalizing,
  finalizeError,
}: {
  draftData: DraftData
  previewGenerations: PreviewGeneration[]
  strings: Record<string, unknown>
  // Live edit handlers — same callbacks the wizard uses on the dedicated
  // appearance/identity/backstory steps. Letting the user tweak from here
  // means they don't have to walk back through 7 steps to fix a wrong
  // breast/butt size after seeing the final preview.
  onAppearanceChange: (next: Record<string, unknown>) => void
  onIdentityChange: (next: Record<string, unknown>) => void
  onUniqueDescChange: (next: Record<string, unknown>) => void
  onFinalize: () => Promise<void>
  finalizing: boolean
  finalizeError: string | null
}) {
  // Memoize the per-section slices so the live-prompt useMemos below have
  // stable dependencies (each `?? {}` fallback otherwise creates a fresh
  // object every render and re-runs the prompt builders unnecessarily).
  const appearance = useMemo(
    () => (draftData.appearance ?? {}) as Record<string, unknown>,
    [draftData.appearance],
  )
  const identity = useMemo(
    () => (draftData.identity ?? {}) as Record<string, unknown>,
    [draftData.identity],
  )
  const backstory = useMemo(
    () => (draftData.backstory ?? {}) as Record<string, unknown>,
    [draftData.backstory],
  )
  const uniqueDesc = useMemo(
    () => (draftData.uniqueDesc ?? {}) as Record<string, unknown>,
    [draftData.uniqueDesc],
  )
  const pathChoice = String(draftData.pathChoice ?? 'presets')
  const selectedId = draftData.selectedReferenceMediaAssetId
  const selectedPreview = previewGenerations.find((g) => String(g.mediaAssetId) === selectedId)

  const name = pathChoice === 'unique' ? String(uniqueDesc.name ?? '') : String(identity.name ?? '')
  const archetype = String(identity.archetype ?? '').replace(/_/g, ' ')
  const ageDisplay = appearance.ageDisplay ? String(appearance.ageDisplay) : ''
  const ethnicity = String(appearance.ethnicity ?? '').replace(/_/g, ' ')
  const occupation =
    String(identity.occupation ?? '') === 'custom'
      ? String(identity.occupationCustom ?? '')
      : String(identity.occupation ?? '').replace(/_/g, ' ')
  const relationship =
    String(backstory.startingRelationship ?? '') === 'custom'
      ? String(backstory.startingRelationshipCustom ?? '')
      : String(backstory.startingRelationship ?? '').replace(/_/g, ' ')
  const kinks = Array.isArray(backstory.kinks) ? (backstory.kinks as string[]) : []
  const personality = String(uniqueDesc.personality ?? '')
  const looks = String(uniqueDesc.looks ?? '')

  const ctaLabel = t(strings, 'builder.actions.create').replace('{name}', name || 'her')

  // Live prompt mirror — same builder helpers the server uses, so the user
  // sees exactly what would go to the model if they re-ran the preview from
  // here. Re-generation itself still happens on the preview step (which has
  // the rate-limited submit/poll loop); we only surface the prompt + edit
  // controls here so the user can adjust before going back.
  const livePrompt = useMemo(
    () =>
      pathChoice === 'unique'
        ? buildUniquePrompt(uniqueDesc, appearance)
        : buildPreviewPrompt(appearance, identity, backstory),
    [pathChoice, uniqueDesc, appearance, identity, backstory],
  )
  const liveNegative = useMemo(
    () => buildPreviewNegativePrompt(appearance),
    [appearance],
  )
  const selectedEndpoint = useMemo(
    () =>
      resolveModelEndpoint(
        typeof appearance.modelEndpoint === 'string'
          ? (appearance.modelEndpoint as string)
          : null,
        String(appearance.artStyle ?? 'realistic'),
      ),
    [appearance],
  )
  const selectedModel = IMAGE_MODELS.find((m) => m.id === selectedEndpoint)
  const supportsNegative = selectedModel?.supportsNegativePrompt ?? true

  const [paramsOpen, setParamsOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <QuestionHeader title={t(strings, 'builder.questions.review').replace('{name}', name || '')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {selectedPreview && (
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={String(selectedPreview.publicUrl ?? '')}
              alt={name || 'Character'}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--color-text)]">{name || '—'}</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {[archetype, ageDisplay, ethnicity].filter(Boolean).join(' · ')}
            </p>
          </div>

          {!!occupation && (
            <p className="text-sm text-[var(--color-text)]">{occupation}</p>
          )}

          {!!relationship && (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t(strings, 'builder.review.relationship')}: {relationship}
            </p>
          )}

          {pathChoice === 'unique' && !!personality && (
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-4">{personality.slice(0, 240)}</p>
          )}

          {pathChoice === 'unique' && !!looks && (
            <p className="text-xs text-[var(--color-text-muted)] italic line-clamp-3">{looks.slice(0, 160)}</p>
          )}

          {kinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {kinks.slice(0, 8).map((k) => (
                <span key={k} className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                  {k.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compact editor + model picker + live prompt — same trio as the
          preview step, but here changes feed into the live prompt below
          instead of triggering an immediate regeneration. The user can go
          back to "Preview" to re-run the model with the new params. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-3">
        <button
          type="button"
          onClick={() => setParamsOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-strong)]/60"
        >
          <span>
            {paramsOpen
              ? t(strings, 'builder.actions.hideParams', 'Hide parameters')
              : t(strings, 'builder.actions.editParams', 'Edit parameters')}
          </span>
          <span aria-hidden>{paramsOpen ? '▴' : '▾'}</span>
        </button>
        {paramsOpen && (
          <CompactParamsEditor
            pathChoice={pathChoice}
            appearance={appearance}
            identity={identity}
            uniqueDesc={uniqueDesc}
            strings={strings}
            onAppearanceChange={onAppearanceChange}
            onIdentityChange={onIdentityChange}
            onUniqueDescChange={onUniqueDescChange}
          />
        )}

        <ModelPicker
          models={IMAGE_MODELS}
          selectedEndpoint={selectedEndpoint}
          artStyle={String(appearance.artStyle ?? 'realistic')}
          strings={strings}
          onSelect={(endpoint) => onAppearanceChange({ ...appearance, modelEndpoint: endpoint })}
        />

        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-strong)]/60"
        >
          <span>
            {promptOpen
              ? t(strings, 'builder.actions.hidePrompt', 'Hide prompt')
              : t(strings, 'builder.actions.showPrompt', 'Show final prompt')}
          </span>
          <span aria-hidden>{promptOpen ? '▴' : '▾'}</span>
        </button>
        {promptOpen && (
          <div className="flex flex-col gap-3">
            <PromptDisplay
              label={t(strings, 'builder.promptPreview.positive', 'Prompt')}
              value={livePrompt}
              strings={strings}
            />
            <div>
              <PromptDisplay
                label={t(strings, 'builder.promptPreview.negative', 'Negative prompt')}
                value={liveNegative}
                strings={strings}
                disabled={!supportsNegative}
              />
              {!supportsNegative && (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {t(
                    strings,
                    'builder.promptPreview.negativeUnsupported',
                    'This model ignores negative prompts.',
                  )}
                </p>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t(
                strings,
                'builder.review.regenerateHint',
                'Changes here update the prompt. Go back to the preview step to regenerate the image.',
              )}
            </p>
          </div>
        )}
      </div>

      {finalizeError && <p className="text-sm text-[var(--color-danger)]">{finalizeError}</p>}

      <Button onClick={onFinalize} disabled={finalizing} size="lg">
        {finalizing ? '...' : ctaLabel}
      </Button>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────

export function CharacterBuilderWizard({ draftId, initialDraft, strings }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Hydrate initial state: URL params override DB draft when present, so a
  // shared link or refresh reads the user's last selection back. Computed
  // once at mount via useState initializer (useSearchParams() is stable
  // through that initializer call).
  const [draftData, setDraftData] = useState<DraftData>(() => {
    const baseDraft: DraftData = {
      pathChoice: (initialDraft.data.pathChoice as 'presets' | 'unique' | undefined) ?? 'presets',
      appearance: (initialDraft.data.appearance as Record<string, unknown>) ?? { gender: 'female', artStyle: 'realistic' },
      identity: (initialDraft.data.identity as Record<string, unknown>) ?? {},
      backstory: (initialDraft.data.backstory as Record<string, unknown>) ?? {},
      uniqueDesc: (initialDraft.data.uniqueDesc as Record<string, unknown>) ?? {},
      selectedReferenceMediaAssetId:
        (initialDraft.data.selectedReferenceMediaAssetId as string | null) ?? null,
    }

    if (searchParams && searchParams.toString().length > 0) {
      const url = parseUrlState(searchParams)
      const hydrated = applyUrlStateToDraft(baseDraft, url)
      return {
        ...hydrated,
        selectedReferenceMediaAssetId: baseDraft.selectedReferenceMediaAssetId,
      }
    }
    return baseDraft
  })
  const [previewGenerations, setPreviewGenerations] = useState<PreviewGeneration[]>(
    initialDraft.previewGenerations as PreviewGeneration[],
  )

  const STEPS = useMemo(
    () => (draftData.pathChoice === 'unique' ? UNIQUE_STEPS : PRESETS_STEPS),
    [draftData.pathChoice],
  )

  // Sub-step index. URL `step > 0` wins as explicit user intent (shared link
  // to "step=4" lands there). step=0 or no step param falls back to walking
  // the persisted draft and resuming at the highest data-satisfied position
  // — otherwise a returning user with a fully-filled draft gets bounced to
  // the intro by a stale `step=0` written during a previous mount, or by the
  // phase-only currentStep fallback (currentStep tracks phase 1-4, which
  // resolves to the FIRST sub-step of that phase and loses position within).
  const initialSubIdx = useMemo(() => {
    const stepsForPath = draftData.pathChoice === 'unique' ? UNIQUE_STEPS : PRESETS_STEPS
    const totalLen = stepsForPath.length
    const urlStep = searchParams ? Number(searchParams.get('step')) : NaN
    if (Number.isFinite(urlStep) && urlStep > 0) {
      return Math.min(Math.max(0, Math.floor(urlStep)), totalLen - 1)
    }
    const inferred = inferFurthestStepIdx(stepsForPath, draftData)
    if (inferred > 0) return inferred
    // Genuinely fresh draft (no data inferred). Honour the saved phase as a
    // last-resort hint so a draft that was created with a non-default phase
    // still lands at that phase's first step.
    const phase = Math.max(1, Math.min(4, initialDraft.currentStep ?? 1))
    const idx = stepsForPath.findIndex((s) => s.phase === phase)
    return idx >= 0 ? idx : 0
    // STEPS depends on pathChoice and is computed above; we deliberately
    // run this once at mount (linter wants STEPS in deps but its identity
    // changes via path swaps, which would re-snap step index).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [stepIdx, setStepIdx] = useState(initialSubIdx)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const urlSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state → URL (debounced). Uses window.history.replaceState
  // directly instead of router.replace because router.replace in App Router
  // triggers an RSC payload re-fetch on every URL change — that shows up as
  // POST /en/builder/<id>?_rsc=… in the network tab on every keystroke and
  // every model switch, looking like spurious work even though no server
  // action runs. history.replaceState is a pure client-side URL update:
  // shareable URL, browser back exits the wizard, zero extra network. The
  // saveDraftStepAction debounce (separate, 600ms) still persists state.
  useEffect(() => {
    if (urlSyncTimeoutRef.current) clearTimeout(urlSyncTimeoutRef.current)
    urlSyncTimeoutRef.current = setTimeout(() => {
      const url = draftToUrlState(draftData, stepIdx)
      const sp = serializeUrlState(url)
      const qs = sp.toString()
      const next = qs ? `${pathname}?${qs}` : pathname
      if (typeof window !== 'undefined' && window.location.href.split('#')[0] !== window.location.origin + next) {
        window.history.replaceState(window.history.state, '', next)
      }
    }, 350)
    return () => {
      if (urlSyncTimeoutRef.current) clearTimeout(urlSyncTimeoutRef.current)
    }
  }, [draftData, stepIdx, pathname])

  // Clamp stepIdx if the path changes (presets → unique or vice versa).
  const safeStepIdx = Math.min(stepIdx, STEPS.length - 1)
  const currentStep = STEPS[safeStepIdx]!
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

  const updateIntro = (next: DraftData) => {
    setDraftData((prev) => ({ ...prev, ...next }))
    scheduleSave(1, {
      pathChoice: next.pathChoice,
      appearance: next.appearance,
    })
  }

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

  const updateUniqueDesc = (next: Record<string, unknown>) => {
    setDraftData((prev) => ({ ...prev, uniqueDesc: next }))
    scheduleSave(4, { uniqueDesc: next })
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
    const u = (draftData.uniqueDesc ?? {}) as Record<string, unknown>
    const hair = (a.hair ?? {}) as Record<string, string>
    const eyes = (a.eyes ?? {}) as Record<string, string>

    switch (currentStep.key) {
      case 'intro':
        return !!a.gender && !!a.artStyle && !!draftData.pathChoice
      case 'unique_desc': {
        const name = String(u.name ?? '')
        return name.length >= 2 && validateName(name).ok && !!String(u.personality ?? '').trim()
      }
      case 'age_ethnicity':
        return !!a.ageRange && !!a.ethnicity
      case 'body':
        return !!a.bodyType && (a.gender === 'male' || !!a.breastSize) && !!a.buttSize
      case 'hair_eyes':
        return !!hair.style && !!hair.color && !!hair.length && !!eyes.color
      case 'preview':
        return !!draftData.selectedReferenceMediaAssetId
      case 'archetype':
        return !!i.archetype
      case 'name_orientation': {
        const name = String(i.name ?? '')
        return name.length >= 2 && validateName(name).ok && !!i.sexualOrientation
      }
      case 'chat_style':
        return !!b.chatStyle
      case 'occupation':
        return (
          !!i.occupation &&
          (i.occupation !== 'custom' || !!String(i.occupationCustom ?? '').trim())
        )
      case 'relationship':
        return (
          !!b.startingRelationship &&
          (b.startingRelationship !== 'custom' ||
            !!String(b.startingRelationshipCustom ?? '').trim())
        )
      case 'kinks':
        return true // optional
      case 'review':
        return true
    }
  }

  const goNext = async () => {
    if (safeStepIdx >= STEPS.length - 1) return
    const nextStep = STEPS[safeStepIdx + 1]!
    // Persist the current phase data when crossing a phase boundary
    if (nextStep.phase !== currentStep.phase) {
      const dataMap: Record<number, Record<string, unknown>> = {
        1: {
          pathChoice: draftData.pathChoice,
          appearance: draftData.appearance,
        },
        2: { identity: draftData.identity },
        3: { backstory: draftData.backstory },
        4: { uniqueDesc: draftData.uniqueDesc },
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaving(true)
      await saveDraftStepAction(draftId, currentStep.phase, dataMap[currentStep.phase] ?? {})
      setSaving(false)
    }
    setStepIdx(safeStepIdx + 1)
  }

  const goPrev = () => {
    if (safeStepIdx > 0) setStepIdx(safeStepIdx - 1)
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    setFinalizeError(null)
    // try/catch so a server-side throw (Payload validation, redirect failure,
    // anything) doesn't leave the Finalize button stranded in its disabled
    // "..." state. On the success path the action calls redirect() which
    // throws NEXT_REDIRECT — Next handles it before this catch sees anything.
    try {
      const result = await finalizeBuilderAction(draftId)
      if (result && !result.ok) {
        const friendly =
          result.error === 'insufficient_tokens'
            ? t(strings, 'builder.errors.insufficientTokens',
                'You don’t have enough tokens to create this character. Top up on the Plans page.')
            : result.error
        setFinalizeError(friendly)
        setFinalizing(false)
      }
    } catch (e) {
      console.error('[builder-finalize] finalizeBuilderAction threw', e)
      setFinalizeError(
        t(strings, 'builder.errors.finalizeFailed',
          'Could not finalize the character. Try again, or contact support if the problem persists.'),
      )
      setFinalizing(false)
    }
  }

  // ── Render the current step ────────────────────────────────────────────
  const appearance = (draftData.appearance ?? {}) as Record<string, unknown>
  const identity = (draftData.identity ?? {}) as Record<string, unknown>
  const backstory = (draftData.backstory ?? {}) as Record<string, unknown>
  const uniqueDesc = (draftData.uniqueDesc ?? {}) as Record<string, unknown>

  const renderStep = () => {
    switch (currentStep.key) {
      case 'intro':
        return <IntroScreen strings={strings} draftData={draftData} onChange={updateIntro} />
      case 'unique_desc':
        return (
          <UniqueDescScreen
            strings={strings}
            uniqueDesc={uniqueDesc}
            appearance={appearance}
            onChange={updateUniqueDesc}
          />
        )
      case 'age_ethnicity':
        return (
          <AgeEthnicityScreen strings={strings} appearance={appearance} onChange={updateAppearance} />
        )
      case 'body':
        return (
          <BodyScreen strings={strings} appearance={appearance} onChange={updateAppearance} />
        )
      case 'hair_eyes':
        return (
          <HairEyesScreen strings={strings} appearance={appearance} onChange={updateAppearance} />
        )
      case 'preview':
        return (
          <PreviewScreen
            strings={strings}
            draftId={draftId}
            pathChoice={String(draftData.pathChoice ?? 'presets')}
            appearance={appearance}
            identity={identity}
            backstory={backstory}
            uniqueDesc={uniqueDesc}
            previewGenerations={previewGenerations}
            selectedReferenceId={draftData.selectedReferenceMediaAssetId ?? null}
            onAppearanceChange={updateAppearance}
            onIdentityChange={updateIdentity}
            onUniqueDescChange={updateUniqueDesc}
            onPreviewsGenerated={setPreviewGenerations}
            onReferenceSelected={handleReferenceSelected}
          />
        )
      case 'archetype':
        return <ArchetypeScreen strings={strings} identity={identity} onChange={updateIdentity} />
      case 'name_orientation':
        return (
          <NameOrientationScreen
            strings={strings}
            identity={identity}
            appearance={appearance}
            onChange={updateIdentity}
            onAgeChange={(v) => updateAppearance({ ...appearance, ageDisplay: v })}
          />
        )
      case 'chat_style':
        return <ChatStyleScreen strings={strings} backstory={backstory} onChange={updateBackstory} />
      case 'occupation':
        return <OccupationScreen strings={strings} identity={identity} onChange={updateIdentity} />
      case 'relationship':
        return (
          <RelationshipScreen strings={strings} backstory={backstory} onChange={updateBackstory} />
        )
      case 'kinks':
        return <KinksScreen strings={strings} backstory={backstory} onChange={updateBackstory} />
      case 'review':
        return (
          <ReviewScreen
            draftData={draftData}
            previewGenerations={previewGenerations}
            strings={strings}
            onAppearanceChange={updateAppearance}
            onIdentityChange={updateIdentity}
            onUniqueDescChange={updateUniqueDesc}
            onFinalize={handleFinalize}
            finalizing={finalizing}
            finalizeError={finalizeError}
          />
        )
    }
  }

  const stepCounter = t(strings, 'builder.stepCounter')
    .replace('{current}', String(safeStepIdx + 1))
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

      <PhaseIndicator
        currentPhase={currentPhase}
        steps={STEPS}
        stepIdx={safeStepIdx}
        strings={strings}
        onJumpToPhase={(phase) => {
          // Jump to the first step of the requested phase. Forward jumps
          // are allowed — canAdvance() still gates the Next button per
          // step, so an under-filled draft can't be finalised. Backward
          // jumps are always safe (data is preserved).
          const targetIdx = STEPS.findIndex((s) => s.phase === phase)
          if (targetIdx >= 0) setStepIdx(targetIdx)
        }}
      />

      <Card className="mb-6">{renderStep()}</Card>

      <div className="flex items-center justify-between">
        <Button onClick={goPrev} disabled={safeStepIdx === 0} variant="ghost">
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
