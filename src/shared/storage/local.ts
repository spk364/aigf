import 'server-only'
import fs from 'fs/promises'
import path from 'path'
import type { UploadResult } from './r2'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

function filePath(key: string): string {
  // key может содержать подкаталоги (character-reference/123/abc.jpg)
  const parts = key.split('/')
  return path.join(UPLOADS_DIR, ...parts)
}

function publicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/uploads/${key}`
}

export async function uploadBuffer(opts: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
  cacheControl?: string
}): Promise<UploadResult> {
  const dest = filePath(opts.key)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, opts.body)
  return {
    key: opts.key,
    publicUrl: publicUrl(opts.key),
    sizeBytes: opts.body.byteLength,
    contentType: opts.contentType,
  }
}

export async function mirrorFromUrl(opts: {
  sourceUrl: string
  destKey: string
  cacheControl?: string
}): Promise<UploadResult> {
  const res = await fetch(opts.sourceUrl)
  if (!res.ok) {
    throw new Error(
      `local.mirrorFromUrl: fetch failed for ${opts.sourceUrl} — ${res.status} ${res.statusText}`,
    )
  }
  const contentType =
    res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream'
  const body = Buffer.from(await res.arrayBuffer())
  return uploadBuffer({ key: opts.destKey, body, contentType })
}

export async function deleteObject(key: string): Promise<void> {
  await fs.unlink(filePath(key)).catch(() => {})
}
