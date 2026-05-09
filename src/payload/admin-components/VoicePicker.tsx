'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDocumentInfo, useField } from '@payloadcms/ui'

// VoicePicker: Payload admin field for `characters.voiceId`. Loads the
// voice catalog from /api/voices, renders a small grid of voice cards with a
// ▶ preview button each, and writes the selected catalog id back into the
// form via useField. Plays one preview at a time.

type VoiceLocale = 'en' | 'ru' | 'es'

type ApiVoice = {
  id: string
  gender: 'female' | 'male'
  vibe: string
  label: string
  blurb: string
  previewUrl: string | null
}

type ApiResponse = { locale: VoiceLocale; voices: ApiVoice[] }

const CARD: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 120ms, background 120ms',
}

const CARD_SELECTED: React.CSSProperties = {
  borderColor: '#7c3aed',
  background: '#faf5ff',
  boxShadow: '0 0 0 1px #7c3aed',
}

const PLAY_BTN: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  border: '1px solid #d1d5db',
  background: '#f3f4f6',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  flexShrink: 0,
}

export function VoicePicker() {
  const { id } = useDocumentInfo()
  // useField writes back into the form state for the `voiceId` field.
  const { value: voiceIdValue, setValue } = useField<string>({ path: 'voiceId' })

  // Surface the active locale for previews. We don't have a single canonical
  // place to read it from in admin (locale switcher state lives behind the UI
  // package), so we just default to 'en' which is the canonical locale.
  const [locale, setLocale] = useState<VoiceLocale>('en')
  const [voices, setVoices] = useState<ApiVoice[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Track which gender filter is active. Default to 'all'.
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    fetch(`/api/voices?locale=${locale}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as ApiResponse
      })
      .then((data) => {
        if (cancelled) return
        setVoices(data.voices)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'failed to load voices')
      })
    return () => {
      cancelled = true
    }
  }, [locale])

  useEffect(() => {
    return () => {
      // Stop any playback on unmount.
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => genderFilter === 'all' || v.gender === genderFilter)
  }, [voices, genderFilter])

  function play(voice: ApiVoice) {
    if (!voice.previewUrl) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playingId === voice.id) {
      // Toggle off.
      setPlayingId(null)
      return
    }
    const audio = new Audio(voice.previewUrl)
    audio.addEventListener('ended', () => setPlayingId((cur) => (cur === voice.id ? null : cur)))
    audio.addEventListener('error', () => setPlayingId((cur) => (cur === voice.id ? null : cur)))
    audio.play().catch(() => setPlayingId(null))
    audioRef.current = audio
    setPlayingId(voice.id)
  }

  function pick(voice: ApiVoice) {
    setValue(voice.id)
  }

  if (!id) {
    return (
      <p style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
        Save the character first, then pick a voice.
      </p>
    )
  }

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)', marginTop: '8px' }}>
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Voice</h4>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px' }}>
        Pick the voice MiniMax will use for greetings and chat ▶. Click any card to preview.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', color: '#6b7280' }}>
          Preview locale{' '}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as VoiceLocale)}
            style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px' }}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="es">Español</option>
          </select>
        </label>
        <label style={{ fontSize: '12px', color: '#6b7280' }}>
          Gender{' '}
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value as 'all' | 'female' | 'male')}
            style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px' }}
          >
            <option value="all">All</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
      </div>

      {loadError && (
        <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 8px' }}>
          Failed to load voice catalog: {loadError}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        {filteredVoices.map((voice) => {
          const selected = voiceIdValue === voice.id
          const playing = playingId === voice.id
          return (
            <button
              key={voice.id}
              type="button"
              onClick={() => pick(voice)}
              style={{ ...CARD, ...(selected ? CARD_SELECTED : {}) }}
            >
              <span
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation()
                  play(voice)
                }}
                style={{
                  ...PLAY_BTN,
                  borderColor: voice.previewUrl ? '#7c3aed' : '#e5e7eb',
                  color: voice.previewUrl ? '#7c3aed' : '#9ca3af',
                  cursor: voice.previewUrl ? 'pointer' : 'not-allowed',
                }}
                aria-label={voice.previewUrl ? `Play preview of ${voice.label}` : 'No preview available'}
              >
                {playing ? '■' : '▶'}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '13px', color: '#111827' }}>
                  {voice.label}
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      color: voice.gender === 'female' ? '#db2777' : '#2563eb',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {voice.gender === 'female' ? '♀' : '♂'} {voice.vibe}
                  </span>
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  {voice.blurb}
                </span>
                {!voice.previewUrl && (
                  <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                    Preview not seeded yet — run pnpm seed:voice-previews
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '10px 0 0' }}>
        Selected voice id: <code>{voiceIdValue || '(none)'}</code> — saved on this character when you Save.
      </p>
    </div>
  )
}
