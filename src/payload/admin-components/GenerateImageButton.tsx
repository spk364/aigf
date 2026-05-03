'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import {
  IMAGE_MODEL_OPTIONS,
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_SIZE_PRESETS,
  DEFAULT_IMAGE_SIZE_PRESET_ID,
} from '@/shared/ai/image-models'

type ImageSize = string

type ImagePhase = 'queued' | 'running' | 'unknown'

type ImageProgressState = {
  status: 'queued' | 'polling'
  requestId: string
  endpoint: string
  modelName: string
  statusUrl: string
  responseUrl: string
  startedAt: number
  promptUsed: string
  negativePromptUsed: string
  modelUsed: string
  setPrimary: boolean
  phase: ImagePhase
  queuePosition: number | null
  lastLog: string | null
}

type State =
  | { status: 'idle' }
  | ImageProgressState
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

const POLL_INTERVAL_MS = 3000

type RefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'done'
      url: string
      mediaAssetId: string | number | null
      width: number
      height: number
      latencyMs: number
      savedPath: string | null
      primarySet: boolean
    }
  | { status: 'error'; message: string }

type SetPrimaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done' }
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

const SIZES: { value: ImageSize; label: string }[] = IMAGE_SIZE_PRESETS.map((p) => ({
  value: p.id,
  label: p.label,
}))

export function GenerateImageButton() {
  const { id, savedDocumentData } = useDocumentInfo()
  const [state, setState] = useState<State>({ status: 'idle' })
  const [refState, setRefState] = useState<RefState>({ status: 'idle' })
  const [refSetPrimaryState, setRefSetPrimaryState] = useState<SetPrimaryState>({ status: 'idle' })
  const [imageSize, setImageSize] = useState<ImageSize>(DEFAULT_IMAGE_SIZE_PRESET_ID)
  const [sceneHint, setSceneHint] = useState('')
  const [modelOverride, setModelOverride] = useState(DEFAULT_IMAGE_MODEL_ID)

  const existingRefUrl = (savedDocumentData as Record<string, unknown> | undefined)?.referenceImageUrl as string | null | undefined
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  if (!id) {
    return (
      <p style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
        Save the character first to generate an image.
      </p>
    )
  }

  const isBusy = state.status === 'queued' || state.status === 'polling'
  const selectedModelInfo = IMAGE_MODEL_OPTIONS.find((m) => m.id === modelOverride)

  async function pollOnce(curState: ImageProgressState) {
    try {
      const params = new URLSearchParams({
        requestId: curState.requestId,
        endpoint: curState.endpoint,
        modelName: curState.modelName,
        statusUrl: curState.statusUrl,
        responseUrl: curState.responseUrl,
        startedAt: String(curState.startedAt),
        promptUsed: curState.promptUsed,
        negativePromptUsed: curState.negativePromptUsed,
        modelUsed: curState.modelUsed,
        setPrimary: String(curState.setPrimary),
      })
      const res = await fetch(`/api/admin/characters/${id}/generate-image-status?${params.toString()}`)
      const data = (await res.json()) as
        | {
            status: 'pending'
            phase?: ImagePhase
            queuePosition?: number | null
            lastLog?: string | null
            raw?: string | null
          }
        | {
            status: 'completed'
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
        | { status: 'failed'; error: string; message?: string }
      if (data.status === 'pending') {
        const next: ImageProgressState = {
          ...curState,
          status: 'polling',
          phase: data.phase ?? 'unknown',
          queuePosition: data.queuePosition ?? null,
          lastLog: data.lastLog ?? null,
        }
        setState(next)
        pollTimer.current = setTimeout(() => pollOnce(next), POLL_INTERVAL_MS)
        return
      }
      if (data.status === 'failed') {
        setState({
          status: 'error',
          message: data.message ?? data.error ?? 'Image generation failed',
        })
        return
      }
      setState({
        status: 'done',
        url: data.url,
        mediaAssetId: data.mediaAssetId ?? null,
        width: data.width,
        height: data.height,
        latencyMs: data.latencyMs,
        persisted: data.persisted ?? true,
        primarySet: data.primarySet ?? false,
        modelUsed: data.modelUsed ?? curState.modelUsed,
        promptUsed: data.promptUsed ?? curState.promptUsed,
        savedPath: data.savedPath ?? null,
      })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Status check failed',
      })
    }
  }

  async function generate(setPrimary: boolean) {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    setState({ status: 'idle' })
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
        ok?: boolean
        error?: string
        message?: string
        requestId?: string
        endpoint?: string
        modelName?: string
        statusUrl?: string
        responseUrl?: string
        promptUsed?: string
        negativePromptUsed?: string
        modelUsed?: string
        setPrimary?: boolean
        startedAt?: number
      }
      if (!res.ok || !data.ok || !data.requestId || !data.statusUrl || !data.responseUrl) {
        setState({
          status: 'error',
          message: data.message ?? data.error ?? `HTTP ${res.status}`,
        })
        return
      }
      const next: ImageProgressState = {
        status: 'queued',
        requestId: data.requestId,
        endpoint: data.endpoint!,
        modelName: data.modelName!,
        statusUrl: data.statusUrl,
        responseUrl: data.responseUrl,
        startedAt: data.startedAt ?? Date.now(),
        promptUsed: data.promptUsed ?? '',
        negativePromptUsed: data.negativePromptUsed ?? '',
        modelUsed: data.modelUsed ?? modelOverride,
        setPrimary: data.setPrimary ?? setPrimary,
        phase: 'unknown',
        queuePosition: null,
        lastLog: null,
      }
      setState(next)
      pollTimer.current = setTimeout(() => pollOnce(next), POLL_INTERVAL_MS)
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function generateReference(setPrimary: boolean) {
    setRefState({ status: 'loading' })
    setRefSetPrimaryState({ status: 'idle' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setPrimary }),
      })
      const data = (await res.json()) as {
        error?: string
        url?: string
        mediaAssetId?: string | number | null
        width?: number
        height?: number
        latencyMs?: number
        savedPath?: string | null
        primarySet?: boolean
      }
      if (!res.ok) {
        setRefState({ status: 'error', message: data.error ?? `HTTP ${res.status}` })
        return
      }
      setRefState({
        status: 'done',
        url: data.url!,
        mediaAssetId: data.mediaAssetId ?? null,
        width: data.width!,
        height: data.height!,
        latencyMs: data.latencyMs!,
        savedPath: data.savedPath ?? null,
        primarySet: !!data.primarySet,
      })
    } catch (err) {
      setRefState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function setReferenceAsPrimary(mediaAssetId: string | number) {
    setRefSetPrimaryState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/set-primary-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetId }),
      })
      const data = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) {
        setRefSetPrimaryState({
          status: 'error',
          message: data.message ?? data.error ?? `HTTP ${res.status}`,
        })
        return
      }
      setRefSetPrimaryState({ status: 'done' })
      // Reflect the new state in the local refState too.
      setRefState((prev) => (prev.status === 'done' ? { ...prev, primarySet: true } : prev))
    } catch (err) {
      setRefSetPrimaryState({
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
      {/* ── Step 1: Lock in face (reference) ──────────────────────────── */}
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
        Step 1 — Lock in face (reference)
      </h4>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px' }}>
        Plain neutral pose, gray studio background, even lighting — used by IP-Adapter
        to keep the face consistent across all later scenes and videos. Generates at
        832×1216 (SDXL-native portrait).
      </p>

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

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <button
          onClick={() => generateReference(false)}
          disabled={refLoading}
          style={{ ...BTN, background: '#7c3aed', color: '#fff', opacity: refLoading ? 0.7 : 1 }}
        >
          {refLoading ? 'Generating…' : 'Generate Reference Image'}
        </button>
        <button
          onClick={() => generateReference(true)}
          disabled={refLoading}
          style={{ ...BTN, background: '#10b981', color: '#fff', opacity: refLoading ? 0.7 : 1 }}
        >
          {refLoading ? 'Generating…' : 'Generate & Set as Primary'}
        </button>
      </div>

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
          {refState.primarySet && (
            <p style={{ fontSize: '12px', color: '#10b981', margin: '4px 0 0' }}>
              ✓ Set as primary image
            </p>
          )}
          {!refState.primarySet && refState.mediaAssetId !== null && (
            <button
              onClick={() => setReferenceAsPrimary(refState.mediaAssetId!)}
              disabled={refSetPrimaryState.status === 'loading'}
              style={{ ...BTN, background: '#10b981', color: '#fff', marginTop: '8px' }}
            >
              {refSetPrimaryState.status === 'loading' ? 'Setting…' : 'Set as Primary Image'}
            </button>
          )}
          {refSetPrimaryState.status === 'error' && (
            <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>
              {refSetPrimaryState.message}
            </p>
          )}
          {refState.savedPath && (
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0', fontFamily: 'monospace' }}>
              {refState.savedPath}
            </p>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)', marginTop: '16px', paddingTop: '16px' }} />

      {/* ── Step 2: Generate scenes ───────────────────────────────────── */}
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
        Step 2 — Generate scenes
      </h4>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 12px' }}>
        Free-form scenes; if a reference exists, IP-Adapter pulls the locked-in face
        automatically. Defaults to 832×1216 portrait (SDXL-native).
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Model
          </label>
          <select
            value={modelOverride}
            onChange={(e) => setModelOverride(e.target.value)}
            disabled={isBusy}
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
            disabled={isBusy}
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
            disabled={isBusy}
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
          disabled={isBusy}
          style={{ ...BTN, background: '#3b82f6', color: '#fff', opacity: isBusy ? 0.7 : 1 }}
        >
          {isBusy ? 'Generating…' : 'Generate'}
        </button>
        <button
          onClick={() => generate(true)}
          disabled={isBusy}
          style={{ ...BTN, background: '#10b981', color: '#fff', opacity: isBusy ? 0.7 : 1 }}
        >
          {isBusy ? 'Generating…' : 'Generate & Set as Primary'}
        </button>
      </div>

      {(state.status === 'queued' || state.status === 'polling') && (
        <div style={{ marginTop: '4px' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
            {state.phase === 'queued'
              ? 'Queued on fal.ai — waiting for a free GPU'
              : state.phase === 'running'
                ? 'Running on GPU — generating image'
                : 'Submitted — waiting for status'}
            {' · '}
            elapsed {Math.floor((Date.now() - state.startedAt) / 1000)}s
            {state.queuePosition !== null && state.queuePosition > 0
              ? ` · queue position #${state.queuePosition}`
              : ''}
          </p>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>
            Polling every {Math.round(POLL_INTERVAL_MS / 1000)}s · {selectedModelInfo?.label ?? modelOverride}
            {selectedModelInfo?.isPony && ' (cold start may add 2–3 min)'}
          </p>
          {state.lastLog && (
            <p
              style={{
                fontSize: '11px',
                color: '#6b7280',
                margin: '4px 0 0',
                fontFamily: 'monospace',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '4px 6px',
                wordBreak: 'break-word',
              }}
            >
              {state.lastLog}
            </p>
          )}
        </div>
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
