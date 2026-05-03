'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type MotionStrength = 'subtle' | 'medium' | 'strong'
type MotionMood = 'gentle' | 'playful' | 'intimate'
type Resolution = '480p' | '580p' | '720p'

type SubmitResponse = {
  ok?: true
  requestId?: string
  endpoint?: string
  sourceImageUrl?: string
  sourceDimensions?: { width: number; height: number } | null
  promptUsed?: string
  motionStrength?: MotionStrength
  mood?: MotionMood
  resolutionWarning?: string | null
  startedAt?: number
  error?: string
  message?: string
}

type StatusResponse =
  | { status: 'pending'; queuePosition?: number | null }
  | {
      status: 'completed'
      video: { url: string; mediaAssetId: string | number; contentType: string }
      seed: number
      latencyMs: number
    }
  | { status: 'failed'; error: string; message?: string }

type ProgressState = {
  status: 'queued' | 'polling'
  requestId: string
  endpoint: string
  startedAt: number
  promptUsed: string
  motionStrength: MotionStrength
  mood: MotionMood
  resolutionWarning: string | null
  queuePosition: number | null
  sourceImageUrl: string
}

type State =
  | { status: 'idle' }
  | ProgressState
  | {
      status: 'done'
      url: string
      mediaAssetId: string | number
      latencyMs: number
      promptUsed: string
      sourceImageUrl: string
    }
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

const MOTION_STRENGTH_OPTIONS: Array<{
  value: MotionStrength
  label: string
  hint: string
}> = [
  {
    value: 'subtle',
    label: 'Subtle',
    hint: '0.3–0.5 · breathing, slight head tilt, idle',
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: '0.6–0.8 · turns, gestures, expressions (recommended)',
  },
  {
    value: 'strong',
    label: 'Strong',
    hint: '0.9+ · bigger movements, may have artifacts',
  },
]

const MOOD_OPTIONS: Array<{ value: MotionMood; label: string }> = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'playful', label: 'Playful' },
  { value: 'intimate', label: 'Intimate' },
]

const RESOLUTION_OPTIONS: Array<{ value: Resolution; label: string }> = [
  { value: '480p', label: '480p (fastest)' },
  { value: '580p', label: '580p' },
  { value: '720p', label: '720p (recommended)' },
]

const POLL_INTERVAL_MS = 5000

export function GenerateVideoButton() {
  const { id, savedDocumentData } = useDocumentInfo()
  const [state, setState] = useState<State>({ status: 'idle' })
  const [motionStrength, setMotionStrength] = useState<MotionStrength>('medium')
  const [mood, setMood] = useState<MotionMood>('gentle')
  const [motionDescription, setMotionDescription] = useState(
    'She slowly turns her head to look at the camera and smiles warmly',
  )
  const [resolution, setResolution] = useState<Resolution>('720p')
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const primaryImageUrl =
    (savedDocumentData as Record<string, unknown> | undefined)?.referenceImageUrl as
      | string
      | null
      | undefined

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  if (!id) {
    return (
      <p style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
        Save the character first to generate a video.
      </p>
    )
  }

  const isBusy = state.status === 'queued' || state.status === 'polling'

  async function pollOnce(curState: ProgressState) {
    try {
      const params = new URLSearchParams({
        requestId: curState.requestId,
        endpoint: curState.endpoint,
        startedAt: String(curState.startedAt),
        motionStrength: curState.motionStrength,
        mood: curState.mood,
        promptUsed: curState.promptUsed,
      })
      const res = await fetch(`/api/admin/characters/${id}/video-status?${params.toString()}`)
      const data = (await res.json()) as StatusResponse
      if (data.status === 'pending') {
        setState({
          ...curState,
          status: 'polling',
          queuePosition: data.queuePosition ?? null,
        })
        pollTimer.current = setTimeout(() => pollOnce(curState), POLL_INTERVAL_MS)
        return
      }
      if (data.status === 'failed') {
        setState({
          status: 'error',
          message: data.message ?? data.error ?? 'Video generation failed',
        })
        return
      }
      setState({
        status: 'done',
        url: data.video.url,
        mediaAssetId: data.video.mediaAssetId,
        latencyMs: data.latencyMs,
        promptUsed: curState.promptUsed,
        sourceImageUrl: curState.sourceImageUrl,
      })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Status check failed',
      })
    }
  }

  async function submit() {
    setState({ status: 'idle' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motionStrength,
          mood,
          motionDescription: motionDescription.trim(),
          resolution,
        }),
      })
      const data = (await res.json()) as SubmitResponse
      if (!res.ok || !data.ok || !data.requestId || !data.endpoint || !data.sourceImageUrl) {
        setState({
          status: 'error',
          message: data.message ?? data.error ?? `HTTP ${res.status}`,
        })
        return
      }
      const next: ProgressState = {
        status: 'queued',
        requestId: data.requestId,
        endpoint: data.endpoint,
        startedAt: data.startedAt ?? Date.now(),
        promptUsed: data.promptUsed ?? '',
        motionStrength: data.motionStrength ?? motionStrength,
        mood: data.mood ?? mood,
        resolutionWarning: data.resolutionWarning ?? null,
        queuePosition: null,
        sourceImageUrl: data.sourceImageUrl,
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

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
        Generate Video (image-to-video)
      </h4>
      <p style={{ margin: '0 0 14px', fontSize: '11px', color: '#9ca3af' }}>
        WAN 2.2 · uses the character&rsquo;s primary or reference image as the source.
        ~90–180 seconds.
      </p>

      {primaryImageUrl ? (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
            Source image (reference)
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={primaryImageUrl}
            alt="Source"
            style={{
              width: '120px',
              height: '120px',
              objectFit: 'cover',
              borderRadius: '6px',
              display: 'block',
            }}
          />
        </div>
      ) : (
        <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>
          No reference or primary image yet. Generate a character image first.
        </p>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Motion strength
          </label>
          <select
            value={motionStrength}
            onChange={(e) => setMotionStrength(e.target.value as MotionStrength)}
            disabled={isBusy}
            style={SELECT}
          >
            {MOTION_STRENGTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
            {MOTION_STRENGTH_OPTIONS.find((o) => o.value === motionStrength)?.hint}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Mood
          </label>
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value as MotionMood)}
            disabled={isBusy}
            style={SELECT}
          >
            {MOOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
            Resolution
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
            disabled={isBusy}
            style={SELECT}
          >
            {RESOLUTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
          Motion description (natural language)
        </label>
        <textarea
          value={motionDescription}
          onChange={(e) => setMotionDescription(e.target.value)}
          disabled={isBusy}
          rows={2}
          placeholder="e.g. She slowly turns her head and gives a soft smile"
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            fontSize: '13px',
            boxSizing: 'border-box',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <button
        onClick={submit}
        disabled={isBusy || !primaryImageUrl}
        style={{
          ...BTN,
          background: '#7c3aed',
          color: '#fff',
          opacity: isBusy || !primaryImageUrl ? 0.7 : 1,
        }}
      >
        {state.status === 'queued' || state.status === 'polling'
          ? 'Generating video…'
          : 'Generate Video'}
      </button>

      {state.status === 'queued' && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
          Queued… polling every 5s. WAN 2.2 typically takes 90–180s.
        </p>
      )}

      {state.status === 'polling' && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
          Generating… elapsed {Math.floor((Date.now() - state.startedAt) / 1000)}s
          {state.queuePosition !== null && state.queuePosition > 0
            ? ` · queue position #${state.queuePosition}`
            : ''}
        </p>
      )}

      {(state.status === 'queued' || state.status === 'polling') && state.resolutionWarning && (
        <p style={{ fontSize: '12px', color: '#d97706', marginTop: '6px' }}>
          ⚠ {state.resolutionWarning}
        </p>
      )}

      {state.status === 'error' && (
        <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '8px' }}>
          Error: {state.message}
        </p>
      )}

      {state.status === 'done' && (
        <div style={{ marginTop: '12px' }}>
          <video
            src={state.url}
            controls
            autoPlay
            loop
            muted
            playsInline
            style={{
              maxWidth: '360px',
              width: '100%',
              borderRadius: '8px',
              display: 'block',
              marginBottom: '8px',
              background: '#000',
            }}
          />
          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
            Saved · asset #{state.mediaAssetId} · {(state.latencyMs / 1000).toFixed(1)} s
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
          <a
            href={state.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '11px', color: '#3b82f6', wordBreak: 'break-all', display: 'block', marginTop: '6px' }}
          >
            {state.url}
          </a>
        </div>
      )}
    </div>
  )
}
