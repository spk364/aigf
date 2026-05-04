'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type MediaItem = {
  id: string | number
  kind: string
  publicUrl: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  createdAt: string | null
  isPrimary: boolean
  isReference: boolean
}

type ListResponse = {
  items?: MediaItem[]
  primaryImageId?: string | null
  referenceImageId?: string | null
  error?: string
  message?: string
}

type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; items: MediaItem[] }
  | { status: 'error'; message: string }

const BTN: React.CSSProperties = {
  padding: '4px 8px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '11px',
  lineHeight: 1,
}

const BADGE: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function CharacterMediaGallery() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<ListState>({ status: 'idle' })
  const [busyId, setBusyId] = useState<string | number | null>(null)

  const refresh = useCallback(async () => {
    if (!id) return
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/media`)
      const data = (await res.json()) as ListResponse
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

  // Refresh whenever a new image is generated elsewhere on the page.
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('character-media-saved', handler)
    return () => window.removeEventListener('character-media-saved', handler)
  }, [refresh])

  async function setPrimary(mediaAssetId: string | number) {
    if (!id) return
    setBusyId(mediaAssetId)
    try {
      const res = await fetch(`/api/admin/characters/${id}/set-primary-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        window.alert(`Set primary failed: ${data.message ?? data.error ?? `HTTP ${res.status}`}`)
        return
      }
      // Optimistic update.
      setState((prev) =>
        prev.status === 'loaded'
          ? {
              status: 'loaded',
              items: prev.items.map((m) => ({
                ...m,
                isPrimary: String(m.id) === String(mediaAssetId),
              })),
            }
          : prev,
      )
    } catch (err) {
      window.alert(`Set primary failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  async function setReference(mediaAssetId: string | number) {
    if (!id) return
    setBusyId(mediaAssetId)
    try {
      const res = await fetch(`/api/admin/characters/${id}/set-reference-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        window.alert(`Set reference failed: ${data.message ?? data.error ?? `HTTP ${res.status}`}`)
        return
      }
      setState((prev) =>
        prev.status === 'loaded'
          ? {
              status: 'loaded',
              items: prev.items.map((m) => ({
                ...m,
                isReference: String(m.id) === String(mediaAssetId),
              })),
            }
          : prev,
      )
    } catch (err) {
      window.alert(`Set reference failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  async function deleteAsset(mediaAssetId: string | number) {
    if (!id) return
    if (!window.confirm('Delete this image? It will be hidden from the gallery (soft delete).')) return
    setBusyId(mediaAssetId)
    try {
      const res = await fetch(`/api/admin/characters/${id}/media/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaAssetId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        window.alert(`Delete failed: ${data.message ?? data.error ?? `HTTP ${res.status}`}`)
        return
      }
      setState((prev) =>
        prev.status === 'loaded'
          ? {
              status: 'loaded',
              items: prev.items.filter((m) => String(m.id) !== String(mediaAssetId)),
            }
          : prev,
      )
    } catch (err) {
      window.alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  if (!id) return null

  const items = state.status === 'loaded' ? state.items : []
  const primary = items.find((m) => m.isPrimary)
  const reference = items.find((m) => m.isReference)

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>
          Media gallery
        </h4>
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

      {state.status === 'loaded' && items.length === 0 && (
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>
          No images yet. Generate a Reference or Character Image below.
        </p>
      )}

      {(primary || reference) && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          {primary && <FeaturedTile label="Primary" colour="#10b981" item={primary} />}
          {reference && <FeaturedTile label="Reference" colour="#7c3aed" item={reference} />}
        </div>
      )}

      {items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px',
          }}
        >
          {items.map((m) => {
            const busy = busyId === m.id
            return (
              <div
                key={String(m.id)}
                style={{
                  border: m.isPrimary
                    ? '2px solid #10b981'
                    : m.isReference
                      ? '2px solid #7c3aed'
                      : '1px solid var(--theme-elevation-100, #e5e7eb)',
                  borderRadius: '6px',
                  padding: '6px',
                  background: 'var(--theme-elevation-0, #fff)',
                  position: 'relative',
                }}
              >
                {m.publicUrl ? (
                  <a href={m.publicUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.publicUrl}
                      alt={`asset ${m.id}`}
                      style={{
                        width: '100%',
                        aspectRatio: m.width && m.height ? `${m.width} / ${m.height}` : '3 / 4',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        display: 'block',
                      }}
                    />
                  </a>
                ) : (
                  <div style={{ fontSize: '11px', color: '#dc2626' }}>missing publicUrl</div>
                )}

                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {m.isPrimary && (
                    <span style={{ ...BADGE, background: '#10b981', color: '#fff' }}>Primary</span>
                  )}
                  {m.isReference && (
                    <span style={{ ...BADGE, background: '#7c3aed', color: '#fff' }}>Reference</span>
                  )}
                  <span style={{ ...BADGE, background: '#e5e7eb', color: '#374151' }}>
                    {m.kind.replace('character_', '')}
                  </span>
                </div>

                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px', lineHeight: 1.4 }}>
                  #{String(m.id)}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ''}
                  {m.sizeBytes ? ` · ${formatBytes(m.sizeBytes)}` : ''}
                </div>
                {m.createdAt && (
                  <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: 1.4 }}>
                    {new Date(m.createdAt).toLocaleString()}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {!m.isPrimary && (
                    <button
                      type="button"
                      onClick={() => setPrimary(m.id)}
                      disabled={busy}
                      style={{ ...BTN, background: '#10b981', color: '#fff', opacity: busy ? 0.6 : 1 }}
                      title="Make this the primary image shown on the catalog"
                    >
                      Primary
                    </button>
                  )}
                  {!m.isReference && (
                    <button
                      type="button"
                      onClick={() => setReference(m.id)}
                      disabled={busy}
                      style={{ ...BTN, background: '#7c3aed', color: '#fff', opacity: busy ? 0.6 : 1 }}
                      title="Use this image for face consistency in future generations"
                    >
                      Reference
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteAsset(m.id)}
                    disabled={busy}
                    style={{ ...BTN, background: '#dc2626', color: '#fff', marginLeft: 'auto', opacity: busy ? 0.6 : 1 }}
                    title="Soft-delete this asset"
                  >
                    {busy ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FeaturedTile({ label, colour, item }: { label: string; colour: string; item: MediaItem }) {
  return (
    <div
      style={{
        border: `2px solid ${colour}`,
        borderRadius: '6px',
        padding: '8px',
        background: 'var(--theme-elevation-0, #fff)',
        flex: '1 1 220px',
        maxWidth: '320px',
      }}
    >
      <div style={{ marginBottom: '6px' }}>
        <span
          style={{
            ...BADGE,
            background: colour,
            color: '#fff',
          }}
        >
          {label}
        </span>
      </div>
      {item.publicUrl ? (
        <a href={item.publicUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.publicUrl}
            alt={label}
            style={{
              width: '100%',
              aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '3 / 4',
              objectFit: 'cover',
              borderRadius: '4px',
              display: 'block',
            }}
          />
        </a>
      ) : (
        <div style={{ fontSize: '11px', color: '#dc2626' }}>missing publicUrl</div>
      )}
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
        #{String(item.id)}
        {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
      </div>
    </div>
  )
}
