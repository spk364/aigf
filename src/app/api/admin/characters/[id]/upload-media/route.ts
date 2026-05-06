// Bigger uploads benefit from a longer Vercel function budget. Hobby caps at
// 60s; we keep it modest and rely on the per-file size limit below.
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import sharp from 'sharp'
import { getCurrentUser } from '@/shared/auth/current-user'
import { buildR2Key, getStorageProvider, uploadBuffer } from '@/shared/storage'

const MAX_BYTES = 60 * 1024 * 1024 // 60 MB — covers short clips + large photos
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
])

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
}

function coerceRelId(v: string | number): string | number {
  if (typeof v === 'number') return v
  if (/^\d+$/.test(v)) return Number(v)
  return v
}

type UploadOutcome =
  | {
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
  | { ok: false; filename: string; error: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: characterId } = await params
  const characterIdCoerced = coerceRelId(characterId)
  const payload = await getPayload({ config })

  // Verify the character exists before bothering with uploads.
  try {
    const character = await payload.findByID({
      collection: 'characters',
      id: characterIdCoerced,
      overrideAccess: true,
      depth: 0,
    })
    if (!character || character.deletedAt) {
      return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'character_not_found' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return NextResponse.json(
      {
        error: 'invalid_form',
        message: err instanceof Error ? err.message : 'failed to parse multipart body',
      },
      { status: 400 },
    )
  }

  const files = formData.getAll('files').filter((v): v is File => v instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'no_files' }, { status: 400 })
  }

  const provider = getStorageProvider()
  const results: UploadOutcome[] = []

  for (const file of files) {
    const rawMime = file.type || 'application/octet-stream'
    const isImage = ALLOWED_IMAGE_MIME.has(rawMime)
    const isVideo = ALLOWED_VIDEO_MIME.has(rawMime)
    if (!isImage && !isVideo) {
      results.push({
        ok: false,
        filename: file.name,
        error: `unsupported_type: ${rawMime}`,
      })
      continue
    }

    if (file.size > MAX_BYTES) {
      results.push({
        ok: false,
        filename: file.name,
        error: `too_large: ${file.size} bytes (max ${MAX_BYTES})`,
      })
      continue
    }

    let buffer: Buffer
    try {
      const arr = await file.arrayBuffer()
      buffer = Buffer.from(arr)
    } catch (err) {
      results.push({
        ok: false,
        filename: file.name,
        error: `read_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      })
      continue
    }

    let width: number | null = null
    let height: number | null = null
    if (isImage) {
      try {
        const meta = await sharp(buffer).metadata()
        width = typeof meta.width === 'number' ? meta.width : null
        height = typeof meta.height === 'number' ? meta.height : null
      } catch {
        // dimensions are nice-to-have; ignore probe failures
      }
    }

    const ext = EXT_BY_MIME[rawMime] ?? (isVideo ? 'bin' : 'bin')
    const key = buildR2Key({
      kind: isImage ? 'character-gallery' : 'character-video',
      characterId: characterIdCoerced,
      ownerId: typeof user.id === 'string' || typeof user.id === 'number' ? user.id : undefined,
      ext,
    })

    let upload: Awaited<ReturnType<typeof uploadBuffer>>
    try {
      upload = await uploadBuffer({
        key,
        body: buffer,
        contentType: rawMime,
      })
    } catch (err) {
      results.push({
        ok: false,
        filename: file.name,
        error: `storage_upload_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      })
      continue
    }

    const collectionKind = isImage ? 'character_gallery' : 'generated_video'

    try {
      const doc = await payload.create({
        collection: 'media-assets',
        data: {
          kind: collectionKind,
          storageKey: upload.key,
          storageProvider: provider,
          publicUrl: upload.publicUrl,
          mimeType: upload.contentType,
          sizeBytes: upload.sizeBytes,
          width: width ?? undefined,
          height: height ?? undefined,
          ownerCharacterId: characterIdCoerced,
          ownerUserId:
            typeof user.id === 'string' || typeof user.id === 'number' ? user.id : undefined,
          generationMetadata: {
            source: 'admin_upload',
            originalFilename: file.name,
            uploadedBy: user.id,
            uploadedAt: new Date().toISOString(),
          },
          moderationStatus: 'pending',
          isNsfw: false,
        },
      })

      results.push({
        ok: true,
        mediaAssetId: doc.id,
        publicUrl: upload.publicUrl,
        kind: collectionKind,
        mimeType: upload.contentType,
        width,
        height,
        sizeBytes: upload.sizeBytes,
        filename: file.name,
      })
    } catch (err) {
      results.push({
        ok: false,
        filename: file.name,
        error: `db_create_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  return NextResponse.json({
    ok: okCount > 0,
    uploaded: okCount,
    failed: results.length - okCount,
    results,
  })
}
