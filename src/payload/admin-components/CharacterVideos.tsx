'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type VideoAsset = {
  id: string | number
  publicUrl: string | null
  width: number | null
  height: number | null
  durationSec: number | null
  sizeBytes: number | null
  mimeType: string | null
  createdAt?: string
  generationMetadata: Record<string, unknown> | null
}

type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; videos: VideoAsset[] }
  | { status: 'error'; message: string }

const BTN: React.CSSProperties = {
  padding: '6px 10px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: 1,
}

function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function CharacterVideos() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<ListState>({ status: 'idle' })
  const [deletingId, setDeletingId] = useState<string | number | null>(null)

  const refresh = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/videos`)
      const data = (await res.json()) as { videos?: VideoAsset[]; error?: string; message?: string }
      if (!res.ok) {
        setState({ status: 'error', message: data.message ?? data.error ?? `HTTP ${res.status}` })
        return
      }
      setState({ status: 'loaded', videos: data.videos ?? [] })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // GenerateVideoButton dispatches this event after a successful save so the
  // gallery refreshes without the admin having to reload the page.
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('character-video-saved', handler)
    return () => window.removeEventListener('character-video-saved', handler)
  }, [refresh])

  async function deleteVideo(mediaAssetId: string | number) {
    if (!id) return
    if (!window.confirm('Delete this video? It will be hidden from the gallery (soft delete).')) return
    setDeletingId(mediaAssetId)
    try {
      const res = await fetch(`/api/admin/characters/${id}/videos/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        window.alert(`Delete failed: ${data.message ?? data.error ?? `HTTP ${res.status}`}`)
        return
      }
      // Optimistic update — drop the deleted asset from the list.
      setState((prev) =>
        prev.status === 'loaded'
          ? { status: 'loaded', videos: prev.videos.filter((v) => String(v.id) !== String(mediaAssetId)) }
          : prev,
      )
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (!id) return null

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>Saved videos</h4>
        <button
          type="button"
          onClick={refresh}
          disabled={state.status === 'loading'}
          style={{ ...BTN, background: 'transparent', color: '#3b82f6', padding: 0 }}
        >
          {state.status === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {state.status === 'error' && (
        <p style={{ fontSize: '12px', color: '#dc2626' }}>Error: {state.message}</p>
      )}

      {state.status === 'loaded' && state.videos.length === 0 && (
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>No videos yet.</p>
      )}

      {state.status === 'loaded' && state.videos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          {state.videos.map((v) => (
            <div
              key={String(v.id)}
              style={{
                border: '1px solid var(--theme-elevation-100, #e5e7eb)',
                borderRadius: '6px',
                padding: '8px',
                background: 'var(--theme-elevation-0, #fff)',
              }}
            >
              {v.publicUrl ? (
                <video
                  src={v.publicUrl}
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  style={{
                    width: '100%',
                    borderRadius: '4px',
                    display: 'block',
                    background: '#000',
                    aspectRatio: v.width && v.height ? `${v.width} / ${v.height}` : '9 / 16',
                  }}
                />
              ) : (
                <div style={{ fontSize: '12px', color: '#dc2626' }}>missing publicUrl</div>
              )}
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: 1.4 }}>
                #{String(v.id)}
                {v.width && v.height ? ` · ${v.width}×${v.height}` : ''}
                {v.durationSec ? ` · ${v.durationSec}s` : ''}
                {v.sizeBytes ? ` · ${formatBytes(v.sizeBytes)}` : ''}
                {v.createdAt ? ` · ${new Date(v.createdAt).toLocaleString()}` : ''}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {v.publicUrl && (
                  <a
                    href={v.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11px', color: '#3b82f6' }}
                  >
                    Open
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => deleteVideo(v.id)}
                  disabled={deletingId === v.id}
                  style={{
                    ...BTN,
                    background: '#dc2626',
                    color: '#fff',
                    marginLeft: 'auto',
                    opacity: deletingId === v.id ? 0.7 : 1,
                  }}
                >
                  {deletingId === v.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
