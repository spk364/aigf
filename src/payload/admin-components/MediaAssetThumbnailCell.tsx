'use client'
// List-view thumbnail cell for the media-assets collection. Wired in via
// the `publicUrl` field's admin.components.Cell so the asset previews
// straight in the table without opening each row.
//
// Renders:
//   - image MIME → 64x64 cover-cropped thumbnail
//   - video MIME → first frame of the video tag (poster-style)
//   - audio MIME → text label with a play link
//   - anything else → just the URL (preserves the old default behaviour)
//
// Click navigates to the public URL in a new tab — the row itself is
// still clickable to open the document (Payload handles that on the row,
// not the cell), so the thumbnail is "open in new tab" rather than
// "open document".

import React from 'react'

type Props = {
  cellData?: unknown
  rowData?: Record<string, unknown>
}

const CELL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}
const IMG_STYLE: React.CSSProperties = {
  width: 64,
  height: 64,
  objectFit: 'cover',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  display: 'block',
}
const FALLBACK_STYLE: React.CSSProperties = {
  width: 64,
  height: 64,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  fontSize: 22,
  lineHeight: 1,
}

function isImageMime(m: string): boolean {
  return m.startsWith('image/')
}
function isVideoMime(m: string): boolean {
  return m.startsWith('video/')
}
function isAudioMime(m: string): boolean {
  return m.startsWith('audio/')
}

export const MediaAssetThumbnailCell: React.FC<Props> = ({ cellData, rowData }) => {
  const url = typeof cellData === 'string' ? cellData : ''
  const mimeType = typeof rowData?.mimeType === 'string' ? rowData.mimeType : ''

  if (!url) {
    return <span style={FALLBACK_STYLE} aria-label="No public URL">—</span>
  }

  // Stop the row-click handler from firing so this acts as an open-in-new-tab
  // shortcut; the rest of the row still opens the document on click.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (isImageMime(mimeType)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop} style={CELL_STYLE}>
        <img src={url} alt="preview" style={IMG_STYLE} loading="lazy" />
      </a>
    )
  }

  if (isVideoMime(mimeType)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop} style={CELL_STYLE}>
        {/* preload=metadata so the browser pulls just enough to render a
            poster frame without downloading the full clip. muted+playsInline
            avoids autoplay/audio surprises in the list view. */}
        <video src={url} style={IMG_STYLE} muted playsInline preload="metadata" />
      </a>
    )
  }

  if (isAudioMime(mimeType)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop} style={CELL_STYLE}>
        <span style={FALLBACK_STYLE} aria-label="Audio asset">
          🔊
        </span>
      </a>
    )
  }

  // Unknown MIME — render as a link so the cell isn't blank.
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop} style={CELL_STYLE}>
      <span style={FALLBACK_STYLE} aria-label="Open asset">
        📄
      </span>
    </a>
  )
}
