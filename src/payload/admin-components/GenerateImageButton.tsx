'use client'
import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { IMAGE_MODEL_OPTIONS, DEFAULT_IMAGE_MODEL_ID } from '@/shared/ai/image-models'

type ImageSize =
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'square_hd'
  | 'square'
  | 'landscape_4_3'
  | 'landscape_16_9'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'done'
      url: string
      mediaAssetId: string | number | null
      width: number
      height: number
      latencyMs: number
      persisted: boolean
      primarySet: boolean
      modelUsed: string
      promptUsed: string
      savedPath: string | null
    }
  | { status: 'error'; message: string }

type RefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; url: string; width: number; height: number; latencyMs: number; savedPath: string | null }
  | { status: 'error'; message: string }

const BTN: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '13px',
  lineHeight: 1,
}

const SELECT: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  fontSize: '13px',
}

const SIZES: { value: ImageSize; label: string }[] = [
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
]

export function GenerateImageButton() {
  const { id, savedDocumentData } = useDocumentInfo()
  const [state, setState] = useState<State>({ status: 'idle' })
  const [refState, setRefState] = useState<RefState>({ status: 'idle' })
  const [imageSize, setImageSize] = useState<ImageSize>('portrait_4_3')
  const [sceneHint, setSceneHint] = useState('')
  const [modelOverride, setModelOverride] = useState(DEFAULT_IMAGE_MODEL_ID)

  const existingRefUrl = (savedDocumentData as Record<string, unknown> | undefined)?.referenceImageUrl as string | null | undefined

  if (!id) {
    return (
      <p style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
        Save the character first to generate an image.
      </p>
    )
  }

  const loading = state.status === 'loading'
  const selectedModelInfo = IMAGE_MODEL_OPTIONS.find((m) => m.id === modelOverride)

  async function generate(setPrimary: boolean) {
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageSize,
          sceneHint: sceneHint.trim() || undefined,
          setPrimary,
          modelOverride,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        url?: string
        mediaAssetId?: string | number | null
        width?: number
        height?: number
        latencyMs?: number
        persisted?: boolean
        primarySet?: boolean
        modelUsed?: string
        promptUsed?: string
        savedPath?: string | null
      }
      if (!res.ok) {
        setState({ status: 'error', message: data.error ?? `HTTP ${res.status}` })
        return
      }
      setState({
        status: 'done',
        url: data.url!,
        mediaAssetId: data.mediaAssetId ?? null,
        width: data.width!,
        height: data.height!,
        latencyMs: data.latencyMs!,
        persisted: data.persisted ?? false,
        primarySet: data.primarySet ?? false,
        modelUsed: data.modelUsed ?? modelOverride,
        promptUsed: data.promptUsed ?? '',
        savedPath: data.savedPath ?? null,
      })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function generateReference() {
    setRefState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as {
        error?: string
        url?: string
        width?: number
        height?: number
        latencyMs?: number
        savedPath?: string | null
      }
      if (!res.ok) {
        setRefState({ status: 'error', message: data.error ?? `HTTP ${res.status}` })
        return
      }
      setRefState({
        status: 'done',
        url: data.url!,
        width: data.width!,
        height: data.height!,
        latencyMs: data.latencyMs!,
        savedPath: data.savedPath ?? null,
      })
    } catch (err) {
      setRefState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const refLoading = refState.status === 'loading'
  const currentRefUrl = refState.status === 'done' ? refState.url : existingRefUrl

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      {/* ── Character Reference section ───────────────────────────────── */}
      <h4 style={{ margin: '0 0 10px', fontWeight: 600, fontSize: '14px' }}>
        Character Reference
      </h4>

      {currentRefUrl && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
            Current reference
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentRefUrl}
            alt="Character reference"
            style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '6px', display: 'block' }}
          />
        </div>
      )}

      <button
        onClick={generateReference}
        disabled={refLoading}
        style={{ ...BTN, background: '#7c3aed', color: '#fff', opacity: refLoading ? 0.7 : 1, marginBottom: '8px' }}
      >
        {refLoading ? 'Generating reference — ~30–60s…' : 'Generate Reference Image'}
      </button>

      {refState.status === 'error' && (
        <p style={{ fontSize: '13px', color: '#dc2626', marginBottom: '8px' }}>
          Reference error: {refState.message}
        </p>
      )}

      {refState.status === 'done' && (
        <div style={{ marginBottom: '8px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a href={refState.url} target="_blank" rel="noreferrer">
            <img
              src={refState.url}
              alt="Reference image"
              style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '6px', display: 'block', marginBottom: '4px' }}
            />
          </a>
          <p style={{ fontSize: '12px', color: '#10b981', margin: '0 0 2px' }}>
            ✓ Reference saved · {refState.width}×{refState.height} · {(refState.latencyMs / 1000).toFixed(1)} s
          </p>
          {refState.savedPath && (
            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, fontFamily: 'monospace' }}>
              {refState.savedPath}
            </p>
          )}
        </div>
      )}

      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 16px' }}>
        Reference is used automatically for face consistency in all future generations.
      </p>

      <div style={{ borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)', paddingTop: '16px' }} />

      {/* ── Generate Character Image section ──────────────────────────── */}
      <h4 style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '14px' }}>
        Generate Character Image
      </h4>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Model
          </label>
          <select
            value={modelOverride}
            onChange={(e) => setModelOverride(e.target.value)}
            disabled={loading}
            style={{ ...SELECT, maxWidth: '220px' }}
          >
            {IMAGE_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {selectedModelInfo && (
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
              {selectedModelInfo.note}
              {selectedModelInfo.isPony && ' · Pony score_ tokens auto-added'}
              {selectedModelInfo.isFlux && ' · scene hint: write full sentences'}
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Size
          </label>
          <select
            value={imageSize}
            onChange={(e) => setImageSize(e.target.value as ImageSize)}
            disabled={loading}
            style={SELECT}
          >
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '220px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Scene hint (optional)
          </label>
          <input
            type="text"
            value={sceneHint}
            onChange={(e) => setSceneHint(e.target.value)}
            placeholder="e.g. sitting on a couch in lingerie"
            disabled={loading}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          onClick={() => generate(false)}
          disabled={loading}
          style={{ ...BTN, background: '#3b82f6', color: '#fff', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
        <button
          onClick={() => generate(true)}
          disabled={loading}
          style={{ ...BTN, background: '#10b981', color: '#fff', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Generating…' : 'Generate & Set as Primary'}
        </button>
      </div>

      {state.status === 'loading' && (
        <p style={{ fontSize: '13px', color: '#6b7280' }}>
          Generating via {selectedModelInfo?.label ?? modelOverride}
          {selectedModelInfo?.isPony
            ? ' — cold start may take 2–3 min…'
            : selectedModelInfo?.isFlux
              ? ' — ~5–60 s…'
              : ' — ~20–60 s…'}
        </p>
      )}

      {state.status === 'error' && (
        <p style={{ fontSize: '13px', color: '#dc2626' }}>Error: {state.message}</p>
      )}

      {state.status === 'done' && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a href={state.url} target="_blank" rel="noreferrer">
            <img
              src={state.url}
              alt="Generated character image"
              style={{
                maxWidth: '280px',
                width: '100%',
                borderRadius: '8px',
                display: 'block',
                marginBottom: '8px',
              }}
            />
          </a>
          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
            {state.width}×{state.height} · {(state.latencyMs / 1000).toFixed(1)} s
            {' · '}{IMAGE_MODEL_OPTIONS.find((m) => m.id === state.modelUsed)?.label ?? state.modelUsed}
            {state.persisted && ` · saved (asset #${state.mediaAssetId})`}
            {!state.persisted && ' · raw fal URL (not saved)'}
          </div>
          {state.promptUsed && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer' }}>
                Prompt sent to fal.ai
              </summary>
              <pre style={{
                fontSize: '10px',
                color: '#6b7280',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: '4px',
              }}>
                {state.promptUsed}
              </pre>
            </details>
          )}
          {state.savedPath && (
            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', fontFamily: 'monospace' }}>
              {state.savedPath}
            </p>
          )}
          {state.primarySet && (
            <p style={{ fontSize: '12px', color: '#10b981', marginTop: '6px' }}>
              ✓ Set as primary image
            </p>
          )}
          {!state.primarySet && state.persisted && (
            <button
              onClick={() => generate(true)}
              style={{ ...BTN, background: '#10b981', color: '#fff', marginTop: '8px' }}
            >
              Set as Primary Image
            </button>
          )}
          <div style={{ marginTop: '8px' }}>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '11px', color: '#3b82f6', wordBreak: 'break-all' }}
            >
              {state.url}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
