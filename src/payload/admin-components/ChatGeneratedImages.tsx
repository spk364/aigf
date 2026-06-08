'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

// Read-only admin block: images USERS generated with this character in chat
// (resolved via message → conversation → character). Separate from the
// admin-managed "Media gallery" so it's clear these are user-created.

type ChatImageItem = {
  id: string | number
  url: string
  width: number | null
  height: number | null
  createdAt: string | null
  userId: string | number | null
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; items: ChatImageItem[] }
  | { status: 'error'; message: string }

const BADGE: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 600,
}

export function ChatGeneratedImages() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<State>({ status: 'idle' })

  const refresh = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/chat-images`)
      const data = (await res.json()) as { items?: ChatImageItem[]; error?: string; message?: string }
      if (!res.ok) {
        setState({ status: 'error', message: data.message ?? data.error ?? `HTTP ${res.status}` })
        return
      }
      setState({ status: 'loaded', items: data.items ?? [] })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!id) return null

  const items = state.status === 'loaded' ? state.items : []

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h4 style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>
          User-generated chat images
          {state.status === 'loaded' && items.length > 0 ? ` (${items.length})` : ''}
        </h4>
        <button
          type="button"
          onClick={refresh}
          disabled={state.status === 'loading'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '11px', padding: 0 }}
        >
          {state.status === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#9ca3af' }}>
        Photos users generated with this character during chat (read-only).
      </p>

      {state.status === 'error' && (
        <p style={{ fontSize: '12px', color: '#dc2626' }}>Error: {state.message}</p>
      )}

      {state.status === 'loaded' && items.length === 0 && (
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>No chat images generated yet.</p>
      )}

      {items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '10px',
          }}
        >
          {items.map((m) => (
            <div
              key={String(m.id)}
              style={{
                border: '1px solid var(--theme-elevation-100, #e5e7eb)',
                borderRadius: '6px',
                padding: '6px',
                background: 'var(--theme-elevation-0, #fff)',
              }}
            >
              <a href={m.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={`chat image ${m.id}`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    aspectRatio: m.width && m.height ? `${m.width} / ${m.height}` : '3 / 4',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    display: 'block',
                  }}
                />
              </a>
              <div style={{ marginTop: '6px' }}>
                <span style={{ ...BADGE, background: '#eef2ff', color: '#4338ca' }}>
                  user #{m.userId != null ? String(m.userId) : '?'}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px', lineHeight: 1.4 }}>
                #{String(m.id)}
                {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
                {m.createdAt ? <><br />{new Date(m.createdAt).toLocaleString()}</> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
