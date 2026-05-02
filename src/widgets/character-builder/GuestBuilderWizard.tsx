'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/shared/ui'
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
} from '@/features/builder/options'
import {
  generateGuestPreviewAction,
  selectGuestPreviewAction,
  updateGuestAppearanceAction,
} from '@/features/builder/guest-actions'
import type { GuestPreviewEntry } from '@/features/builder/guest-cookie'

type Props = {
  locale: 'en' | 'ru' | 'es'
  initialAppearance: Record<string, unknown>
  initialPreviews: GuestPreviewEntry[]
  initialSelectedMediaAssetId: string | null
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

export function GuestBuilderWizard({
  locale,
  initialAppearance,
  initialPreviews,
  initialSelectedMediaAssetId,
  strings,
}: Props) {
  const [appearance, setAppearance] = useState<Record<string, unknown>>(initialAppearance)
  const [previews, setPreviews] = useState<GuestPreviewEntry[]>(initialPreviews)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedMediaAssetId)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startSaveTransition] = useTransition()

  const updateAppearance = (next: Record<string, unknown>) => {
    setAppearance(next)
    startSaveTransition(() => {
      void updateGuestAppearanceAction(next)
    })
  }

  const hair = (appearance.hair ?? {}) as Record<string, string>
  const eyes = (appearance.eyes ?? {}) as Record<string, string>

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    const result = await generateGuestPreviewAction({
      appearance,
      language: locale,
    })
    setGenerating(false)
    if (!result.ok) {
      switch (result.error) {
        case 'rate_limited_hour':
          setError(t(strings, 'tryBuilder.errors.rateLimitedHour'))
          break
        case 'rate_limited_day':
          setError(t(strings, 'tryBuilder.errors.rateLimitedDay'))
          break
        case 'preview_limit_reached':
          setError(t(strings, 'tryBuilder.errors.previewLimit'))
          break
        case 'generation_failed':
          setError(t(strings, 'tryBuilder.errors.generationFailed'))
          break
        default:
          setError(t(strings, 'tryBuilder.errors.generationFailed'))
      }
      return
    }
    setPreviews((prev) => [...prev, ...result.previews])
  }

  const handleSelect = async (mediaAssetId: string) => {
    setSelectedId(mediaAssetId)
    await selectGuestPreviewAction(mediaAssetId)
  }

  const signupHref = `/${locale}/signup`

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
          {t(strings, 'tryBuilder.title')}
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)]">
          {t(strings, 'tryBuilder.subtitle')}
        </p>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-5">
          <SelectField
            label={t(strings, 'builder.fields.artStyle')}
            value={String(appearance.artStyle ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, artStyle: v })}
            options={ART_STYLES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
          />

          <MultiSelectField
            label={t(strings, 'builder.fields.ethnicity')}
            value={Array.isArray(appearance.ethnicity) ? (appearance.ethnicity as string[]) : []}
            onChange={(v) => updateAppearance({ ...appearance, ethnicity: v })}
            options={ETHNICITIES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
          />

          <SelectField
            label={t(strings, 'builder.fields.ageRange')}
            value={String(appearance.ageRange ?? '')}
            onChange={(v) => {
              const range = AGE_RANGES.find((r) => r.value === v)
              updateAppearance({ ...appearance, ageRange: v, ageDisplay: range?.defaultAge ?? 25 })
            }}
            options={AGE_RANGES.map((o) => ({
              value: o.value,
              label: `${t(strings, o.labelKey)} (${o.rangeLabel})`,
            }))}
          />

          <SelectField
            label={t(strings, 'builder.fields.bodyType')}
            value={String(appearance.bodyType ?? '')}
            onChange={(v) => updateAppearance({ ...appearance, bodyType: v })}
            options={BODY_TYPES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label={t(strings, 'builder.fields.hairColor')}
              value={hair.color ?? ''}
              onChange={(v) => updateAppearance({ ...appearance, hair: { ...hair, color: v } })}
              options={HAIR_COLORS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
            />
            <SelectField
              label={t(strings, 'builder.fields.hairLength')}
              value={hair.length ?? ''}
              onChange={(v) => updateAppearance({ ...appearance, hair: { ...hair, length: v } })}
              options={HAIR_LENGTHS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
            />
            <SelectField
              label={t(strings, 'builder.fields.hairStyle')}
              value={hair.style ?? ''}
              onChange={(v) => updateAppearance({ ...appearance, hair: { ...hair, style: v } })}
              options={HAIR_STYLES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
            />
          </div>

          <SelectField
            label={t(strings, 'builder.fields.eyeColor')}
            value={eyes.color ?? ''}
            onChange={(v) => updateAppearance({ ...appearance, eyes: { ...eyes, color: v } })}
            options={EYE_COLORS.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
          />

          <MultiSelectField
            label={t(strings, 'builder.fields.features')}
            value={Array.isArray(appearance.features) ? (appearance.features as string[]) : []}
            onChange={(v) => updateAppearance({ ...appearance, features: v })}
            options={FEATURES.map((o) => ({ value: o.value, label: t(strings, o.labelKey) }))}
          />
        </div>
      </Card>

      <div className="flex flex-col items-center gap-4">
        {error && (
          <p className="text-sm text-[var(--color-danger)] text-center">{error}</p>
        )}
        <Button onClick={handleGenerate} disabled={generating} size="lg">
          {generating
            ? t(strings, 'tryBuilder.actions.generating')
            : previews.length === 0
              ? t(strings, 'tryBuilder.actions.generate')
              : t(strings, 'tryBuilder.actions.regenerate')}
        </Button>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t(strings, 'tryBuilder.hint')}
        </p>
      </div>

      {previews.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-sm font-medium text-[var(--color-text)]">
            {t(strings, 'tryBuilder.previewsHeading')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {previews.map((preview) => {
              const id = preview.mediaAssetId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={[
                    'relative overflow-hidden rounded-xl border-2 aspect-[3/4] transition-all',
                    selectedId === id
                      ? 'border-[var(--color-accent-strong)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent-strong)]/50',
                  ].join(' ')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.publicUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  {selectedId === id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-accent-strong)]/20">
                      <span className="rounded-full bg-[var(--color-accent-strong)] px-3 py-1 text-xs text-[var(--color-bg)] font-semibold">
                        {t(strings, 'tryBuilder.actions.selected')}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedId && (
        <div className="mt-10 rounded-2xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-strong)]/10 p-6 text-center">
          <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
            {t(strings, 'tryBuilder.cta.heading')}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-5">
            {t(strings, 'tryBuilder.cta.body')}
          </p>
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-7 py-3.5 text-base font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
          >
            {t(strings, 'tryBuilder.cta.signup')}
          </Link>
        </div>
      )}
    </div>
  )
}
