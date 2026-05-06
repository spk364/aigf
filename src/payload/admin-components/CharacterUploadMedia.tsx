'use client'
import React, { useCallback, useRef, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type UploadedItem = {
  ok: true
  mediaAssetId: string | number
  publicUrl: string
  kind: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number
  filename: string
}

type FailedItem = {
  ok: false
  filename: string
  error: string
}

type UploadResultItem = UploadedItem | FailedItem

type UploadResponse = {
  ok?: boolean
  uploaded?: number
  failed?: number
  results?: UploadResultItem[]
  error?: string
  message?: string
}

type State =
  | { status: 'idle' }
  | { status: 'uploading'; total: number }
  | { status: 'done'; uploaded: number; failed: number; results: UploadResultItem[] }
  | { status: 'error'; message: string }

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-matroska'

const BTN: React.CSSProperties = {
  padding: '8px 14px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function CharacterUploadMedia() {
  const { id } = useDocumentInfo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [isDragging, setIsDragging] = useState(false)

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!id) return
      const list = Array.from(files)
      if (list.length === 0) return

      setState({ status: 'uploading', total: list.length })

      const fd = new FormData()
      for (const f of list) fd.append('files', f)

      try {
        const res = await fetch(`/api/admin/characters/${id}/upload-media`, {
          method: 'POST',
          body: fd,
        })
        const data = (await res.json()) as UploadResponse
        if (!res.ok) {
          setState({
            status: 'error',
            message: data.message ?? data.error ?? `HTTP ${res.status}`,
          })
          return
        }
        setState({
          status: 'done',
          uploaded: data.uploaded ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        })
        // Refresh both the image gallery and the videos panel.
        window.dispatchEvent(new CustomEvent('character-media-saved'))
        window.dispatchEvent(new CustomEvent('character-video-saved'))
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Upload failed',
        })
      }
    },
    [id],
  )

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      void upload(files)
    }
    // Reset so the same file can be picked again after failure.
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) void upload(files)
  }

  if (!id) {
    return (
      <div
        style={{
          padding: '16px',
          marginTop: '8px',
          borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
        }}
      >
        <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
          Upload from your computer
        </h4>
        <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
          Save the character first to enable uploads.
        </p>
      </div>
    )
  }

  const busy = state.status === 'uploading'

  return (
    <div
      style={{
        padding: '16px',
        marginTop: '8px',
        borderTop: '1px solid var(--theme-elevation-100, #e5e7eb)',
      }}
    >
      <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
        Upload from your computer
      </h4>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px' }}>
        Drag & drop images or videos here, or use the picker. Files are saved
        directly to the character&rsquo;s media gallery — images appear in the
        gallery above; videos appear in the video panel. Up to 60 MB per file.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        style={{
          border: `2px dashed ${isDragging ? '#3b82f6' : 'var(--theme-elevation-150, #d1d5db)'}`,
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          background: isDragging
            ? 'rgba(59, 130, 246, 0.06)'
            : 'var(--theme-elevation-50, #f9fafb)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#374151', fontWeight: 600 }}>
          {busy
            ? `Uploading ${state.total} file${state.total === 1 ? '' : 's'}…`
            : isDragging
              ? 'Drop to upload'
              : 'Drop files here or click to browse'}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>
          JPG · PNG · WebP · GIF · AVIF · MP4 · WebM · MOV
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onPick}
        disabled={busy}
        style={{ display: 'none' }}
      />

      <div style={{ marginTop: '10px' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ ...BTN, background: '#3b82f6', color: '#fff', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Uploading…' : 'Choose files'}
        </button>
      </div>

      {state.status === 'error' && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '10px' }}>
          Upload failed: {state.message}
        </p>
      )}

      {state.status === 'done' && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '12px', color: '#10b981', margin: '0 0 6px' }}>
            ✓ {state.uploaded} uploaded
            {state.failed > 0 && ` · ${state.failed} failed`}
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontSize: '11px',
              color: '#6b7280',
            }}
          >
            {state.results.map((r, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 0',
                  fontFamily: 'monospace',
                  color: r.ok ? '#374151' : '#dc2626',
                }}
              >
                <span>{r.ok ? '✓' : '✗'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.filename}
                </span>
                {r.ok ? (
                  <span style={{ color: '#9ca3af' }}>
                    {r.kind === 'generated_video' ? 'video' : 'image'} · {formatBytes(r.sizeBytes)}
                    {r.width && r.height ? ` · ${r.width}×${r.height}` : ''}
                  </span>
                ) : (
                  <span>{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
