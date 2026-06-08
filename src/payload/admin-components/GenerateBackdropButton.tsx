'use client'
import React, { useState } from 'react'
import { useDocumentInfo, useField } from '@payloadcms/ui'

// Admin action: generate the chat "standee" — a full-body, revealing,
// transparent-background PNG shown in the chat window. Calls
// POST /api/admin/characters/:id/generate-backdrop (image-edit → bg-removal →
// persist), then reflects the new URL in the chatBackdropUrl field.

type State =
  | { status: 'idle' }
  | { status: 'generating' }
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

// Checkerboard so the transparent cutout is obviously transparent in preview.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
}

export function GenerateBackdropButton() {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string>({ path: 'chatBackdropUrl' })
  const [state, setState] = useState<State>({ status: 'idle' })

  async function generate() {
    if (!id) return
    setState({ status: 'generating' })
    try {
      const res = await fetch(`/api/admin/characters/${id}/generate-backdrop`, { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string; message?: string }
      if (!res.ok || !data.ok || !data.url) {
        setState({ status: 'error', message: data.message ?? data.error ?? `HTTP ${res.status}` })
        return
      }
      setValue(data.url)
      setState({ status: 'idle' })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  if (!id) return null

  return (
    <div style={{ padding: '16px', marginTop: '8px', borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)' }}>
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Chat backdrop (standee)</h4>
      <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#9ca3af', maxWidth: '520px' }}>
        Full-body, revealing, transparent-background image shown in the chat window. Generated from
        the character&apos;s reference image (~25 s). Requires a reference or primary image.
      </p>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={generate}
          disabled={state.status === 'generating'}
          style={{ ...BTN, background: '#7c3aed', color: '#fff', opacity: state.status === 'generating' ? 0.6 : 1 }}
        >
          {state.status === 'generating'
            ? 'Generating… (~25 s)'
            : value
              ? 'Regenerate backdrop'
              : 'Generate chat backdrop'}
        </button>

        {value && (
          <div style={{ ...CHECKER, borderRadius: '6px', padding: '4px', border: '1px solid var(--theme-elevation-100, #e5e7eb)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="chat backdrop"
              style={{ height: '220px', width: 'auto', display: 'block', borderRadius: '4px' }}
            />
          </div>
        )}
      </div>

      {state.status === 'error' && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>Error: {state.message}</p>
      )}
    </div>
  )
}
