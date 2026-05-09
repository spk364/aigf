'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

// GenerateGreetingButton: small text + voice/model picker + generate button
// for the greeting clip. Calls POST /api/admin/characters/:id/generate-greeting
// (synchronous — MiniMax usually returns in 3-15 s) and shows the resulting
// audio with a ▶ button. Persists by default; preview-only via the toggle.

type EndpointId =
  | 'fal-ai/minimax/speech-02-hd'
  | 'fal-ai/minimax/speech-02-turbo'

const ENDPOINT_OPTIONS: { id: EndpointId; label: string; note: string }[] = [
  {
    id: 'fal-ai/minimax/speech-02-hd',
    label: 'MiniMax Speech-02 HD',
    note: 'Best quality, ~$0.10/1k chars, 30+ languages',
  },
  {
    id: 'fal-ai/minimax/speech-02-turbo',
    label: 'MiniMax Speech-02 Turbo',
    note: 'Faster + cheaper, slightly lower quality',
  },
]

type State =
  | { status: 'idle' }
  | { status: 'generating' }
  | {
      status: 'done'
      audioUrl: string
      mediaAssetId: string | number | null
      durationSec: number | null
      voiceId: string
      latencyMs: number
      persisted: boolean
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

const TEXTAREA: React.CSSProperties = {
  width: '100%',
  minHeight: '64px',
  padding: '8px 10px',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  fontSize: '13px',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
}

const DEFAULT_TEXT = "Hi, I'm so glad you're here. Stay with me a little while?"

export function GenerateGreetingButton() {
  const { id, savedDocumentData } = useDocumentInfo()
  const [text, setText] = useState(DEFAULT_TEXT)
  const [endpoint, setEndpoint] = useState<EndpointId>('fal-ai/minimax/speech-02-hd')
  const [persist, setPersist] = useState(true)
  const [state, setState] = useState<State>({ status: 'idle' })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  const characterVoiceId =
    (savedDocumentData as Record<string, unknown> | undefined)?.voiceId as string | undefined
  const existingGreetingRel = (savedDocumentData as Record<string, unknown> | undefined)?.greetingAudioAssetId
  const existingGreetingUrl = (() => {
    if (existingGreetingRel && typeof existingGreetingRel === 'object' && 'publicUrl' in existingGreetingRel) {
      const u = (existingGreetingRel as { publicUrl?: string }).publicUrl
      return u ?? null
    }
    return null
  })()

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  if (!id) {
    return (
      <p style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
        Save the character first, pick a voice above, then generate a greeting.
      </p>
    )
  }

  function play(url: string) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playing) {
      setPlaying(false)
      return
    }
    const audio = new Audio(url)
    audio.addEventListener('ended', () => setPlaying(false))
    audio.addEventListener('error', () => setPlaying(false))
    audio.play().catch(() => setPlaying(false))
    audioRef.current = audio
    setPlaying(true)
  }

  async function generate() {
    setState({ status: 'generating' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-greeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          endpoint,
          persist,
          // Use the form's selected voice when available — falls back to the
          // character's saved voiceId, then to the catalog default server-side.
          ...(characterVoiceId ? { voiceId: characterVoiceId } : {}),
        }),
      })
      const data = (await res.json()) as
        | {
            ok: true
            audioUrl: string
            mediaAssetId?: string | number | null
            durationSec: number | null
            voiceId: string
            latencyMs: number
            persisted?: boolean
            preview?: boolean
          }
        | { error: string; message?: string }
      if (!res.ok || 'error' in data) {
        const msg = 'error' in data ? `${data.error}${data.message ? ` — ${data.message}` : ''}` : `HTTP ${res.status}`
        setState({ status: 'error', message: msg })
        return
      }
      setState({
        status: 'done',
        audioUrl: data.audioUrl,
        mediaAssetId: data.mediaAssetId ?? null,
        durationSec: data.durationSec,
        voiceId: data.voiceId,
        latencyMs: data.latencyMs,
        persisted: data.persisted === true,
      })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const busy = state.status === 'generating'

  return (
    <div
      style={{
        padding: '16px 0',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
        Greeting voice line
      </h4>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px' }}>
        Generates a short voiced greeting using the selected voice. Plays on the character card and
        as the first chat utterance.
      </p>

      {existingGreetingUrl && state.status !== 'done' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            padding: '8px 10px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            background: '#f9fafb',
          }}
        >
          <button
            type="button"
            onClick={() => play(existingGreetingUrl)}
            style={{
              ...BTN,
              background: '#7c3aed',
              color: '#fff',
              padding: '6px 10px',
            }}
          >
            {playing ? '■' : '▶'} Preview saved
          </button>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Current greeting clip
          </span>
        </div>
      )}

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
          Text
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          disabled={busy}
          style={TEXTAREA}
        />
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
          {text.length} / 600 chars
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: '#6b7280' }}>
          Model
          <br />
          <select
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value as EndpointId)}
            disabled={busy}
            style={{ ...SELECT, marginTop: '4px' }}
          >
            {ENDPOINT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
            {ENDPOINT_OPTIONS.find((o) => o.id === endpoint)?.note}
          </div>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#6b7280',
            alignSelf: 'flex-end',
            paddingBottom: '4px',
          }}
        >
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
            disabled={busy}
          />
          Save as greeting (uncheck for preview only)
        </label>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={busy || text.trim().length === 0}
        style={{
          ...BTN,
          background: '#7c3aed',
          color: '#fff',
          opacity: busy || text.trim().length === 0 ? 0.6 : 1,
        }}
      >
        {busy ? 'Generating…' : 'Generate greeting'}
      </button>

      {state.status === 'error' && (
        <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '10px' }}>
          Error: {state.message}
        </p>
      )}

      {state.status === 'done' && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => play(state.audioUrl)}
              style={{
                ...BTN,
                background: '#10b981',
                color: '#fff',
                padding: '6px 12px',
              }}
            >
              {playing ? '■' : '▶'} Play
            </button>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {state.durationSec ? `${state.durationSec.toFixed(1)} s · ` : ''}
              {(state.latencyMs / 1000).toFixed(1)} s gen ·
              voice <code>{state.voiceId}</code>
              {state.persisted ? ' · saved' : ' · preview only'}
            </span>
          </div>
          {state.persisted && state.mediaAssetId !== null && (
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '6px 0 0' }}>
              media-asset #{state.mediaAssetId} — reload to see in fields above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
