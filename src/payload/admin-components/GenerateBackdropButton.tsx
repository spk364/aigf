'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo, useField } from '@payloadcms/ui'

// Admin: generate chat "standee" candidates and pick which one is active.
// A standee = full-body, revealing (lingerie + heels, posing, smiling),
// transparent-background image shown in the chat window. Generation:
// POST .../generate-backdrop; listing + activate/delete: .../backdrops.

type Backdrop = {
  id: string | number
  url: string
  width: number | null
  height: number | null
  createdAt: string | null
  isActive: boolean
}

type Gen = { status: 'idle' } | { status: 'generating' } | { status: 'error'; message: string }

const BTN: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '13px',
  lineHeight: 1,
}

const SMALL_BTN: React.CSSProperties = {
  padding: '4px 8px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '11px',
  lineHeight: 1,
}

// Checkerboard so the transparent cutout reads as transparent.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
}

export function GenerateBackdropButton() {
  const { id } = useDocumentInfo()
  // Keep the form field in sync so a save reflects the active URL immediately.
  const { value: activeUrl, setValue: setActiveUrl } = useField<string>({ path: 'chatBackdropUrl' })
  const [items, setItems] = useState<Backdrop[]>([])
  const [gen, setGen] = useState<Gen>({ status: 'idle' })
  const [busyId, setBusyId] = useState<string | number | null>(null)

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/admin/characters/${id}/backdrops`)
      const data = (await res.json()) as { items?: Backdrop[]; activeUrl?: string | null }
      if (res.ok) {
        setItems(data.items ?? [])
        setActiveUrl(data.activeUrl ?? '')
      }
    } catch {
      /* non-fatal */
    }
  }, [id, setActiveUrl])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function generate() {
    if (!id) return
    setGen({ status: 'generating' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-backdrop`, { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        setGen({ status: 'error', message: data.message ?? data.error ?? `HTTP ${res.status}` })
        return
      }
      setGen({ status: 'idle' })
      await refresh()
    } catch (err) {
      setGen({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  async function act(action: 'activate' | 'delete', mediaAssetId: string | number) {
    if (!id) return
    if (action === 'delete' && !window.confirm('Delete this backdrop candidate?')) return
    setBusyId(mediaAssetId)
    try {
      const res = await fetch(`/api/admin/characters/${id}/backdrops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, mediaAssetId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      if (!res.ok || !data.ok) {
        window.alert(`${action} failed: ${data.message ?? data.error ?? `HTTP ${res.status}`}`)
        return
      }
      await refresh()
    } catch (err) {
      window.alert(`${action} failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  if (!id) return null

  return (
    <div style={{ padding: '16px', marginTop: '8px', borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)' }}>
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Chat backdrop (standee)</h4>
      <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#9ca3af', maxWidth: '540px' }}>
        Full-body image shown in the chat window — revealing outfit / lingerie + heels, posing and
        smiling, on a transparent background. Generate a few from the character&apos;s reference image
        (~25 s each) and pick which one is active. Requires a reference or primary image.
      </p>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={generate}
          disabled={gen.status === 'generating'}
          style={{ ...BTN, background: '#7c3aed', color: '#fff', opacity: gen.status === 'generating' ? 0.6 : 1 }}
        >
          {gen.status === 'generating'
            ? 'Generating… (~25 s)'
            : items.length
              ? 'Generate another'
              : 'Generate backdrop'}
        </button>
        {activeUrl ? (
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>● Active backdrop set</span>
        ) : (
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>No active backdrop — pick one below.</span>
        )}
      </div>

      {gen.status === 'error' && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>Error: {gen.message}</p>
      )}

      {items.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>No backdrops yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
          {items.map((m) => {
            const busy = busyId === m.id
            return (
              <div
                key={String(m.id)}
                style={{
                  border: m.isActive ? '2px solid #10b981' : '1px solid var(--theme-elevation-100, #e5e7eb)',
                  borderRadius: '6px',
                  padding: '6px',
                  background: 'var(--theme-elevation-0, #fff)',
                }}
              >
                <div style={{ ...CHECKER, borderRadius: '4px' }}>
                  <a href={m.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={`backdrop ${m.id}`}
                      loading="lazy"
                      style={{
                        width: '100%',
                        aspectRatio: m.width && m.height ? `${m.width} / ${m.height}` : '3 / 4',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </a>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {m.isActive ? (
                    <span style={{ ...SMALL_BTN, background: '#10b981', color: '#fff', cursor: 'default' }}>
                      ● Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => act('activate', m.id)}
                      disabled={busy}
                      style={{ ...SMALL_BTN, background: '#10b981', color: '#fff', opacity: busy ? 0.6 : 1 }}
                    >
                      Set as backdrop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => act('delete', m.id)}
                    disabled={busy}
                    style={{ ...SMALL_BTN, background: '#dc2626', color: '#fff', marginLeft: 'auto', opacity: busy ? 0.6 : 1 }}
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
