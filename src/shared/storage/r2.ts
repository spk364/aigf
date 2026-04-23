import 'server-only'

/*
 * R2 object storage wrapper for Cloudflare R2 (S3-compatible).
 *
 * We use R2 because it is cheap (zero egress fees), S3-compatible (works with @aws-sdk/client-s3),
 * and served from Cloudflare's edge via a public CDN domain. fal.ai CDN URLs (v3b.fal.media) may
 * expire, so we mirror every generated image to R2 immediately after generation — giving us a
 * durable, controlled URL for the lifetime of the asset. Public URLs use the R2_PUBLIC_URL prefix,
 * which is the CDN domain configured in the Cloudflare R2 dashboard under the bucket's "Public
 * Access" tab — either a custom domain (e.g. https://cdn.example.com) or the free
 * pub-<id>.r2.dev domain that Cloudflare assigns when you enable public access on a bucket (no
 * custom domain required for development).
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from '@/shared/config/env'

// Lazily instantiated so that code paths that don't need R2 never error on missing env vars.
let _client: S3Client | null = null

function getR2Config(): { client: S3Client; bucket: string; publicUrl: string } {
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET
  const publicUrl = env.R2_PUBLIC_URL

  if (!accountId) throw new Error('R2_ACCOUNT_ID is not set')
  if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID is not set')
  if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY is not set')
  if (!bucket) throw new Error('R2_BUCKET is not set')
  if (!publicUrl) throw new Error('R2_PUBLIC_URL is not set')

  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  return { client: _client, bucket, publicUrl }
}

export type UploadResult = {
  key: string
  publicUrl: string
  sizeBytes: number
  contentType: string
}

export async function uploadBuffer(opts: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
  cacheControl?: string
}): Promise<UploadResult> {
  const { client, bucket, publicUrl: baseUrl } = getR2Config()

  const cacheControl = opts.cacheControl ?? 'public, max-age=31536000, immutable'
  const sizeBytes = opts.body.byteLength

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      ContentLength: sizeBytes,
      CacheControl: cacheControl,
    }),
  )

  return {
    key: opts.key,
    publicUrl: `${baseUrl}/${opts.key}`,
    sizeBytes,
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
    throw new Error(`mirrorFromUrl: fetch failed for ${opts.sourceUrl} — ${res.status} ${res.statusText}`)
  }

  // Infer content-type from response header; fall back to octet-stream.
  const contentType =
    res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'

  const arrayBuffer = await res.arrayBuffer()
  const body = Buffer.from(arrayBuffer)

  return uploadBuffer({
    key: opts.destKey,
    body,
    contentType,
    cacheControl: opts.cacheControl,
  })
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getR2Config()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

// Supported asset kinds used in key hierarchy.
export type R2KeyKind =
  | 'character-reference'
  | 'character-gallery'
  | 'character-preview'
  | 'message-image'
  | 'message-video'
  | 'user-avatar'

export function buildR2Key(parts: {
  kind: R2KeyKind
  ownerId?: string | number
  characterId?: string | number
  conversationId?: string | number
  messageId?: string | number
  ext: string
}): string {
  // Short random suffix to avoid collisions on regeneration.
  const shortId = crypto.randomUUID().slice(0, 8)

  // Pick the most specific scoping id available for the second path segment.
  const scopeId = parts.characterId ?? parts.ownerId ?? parts.conversationId ?? 'unscoped'

  // Optional message prefix within the scope.
  const nameParts: string[] = []
  if (parts.messageId) nameParts.push(String(parts.messageId))
  nameParts.push(shortId)

  return `${parts.kind}/${scopeId}/${nameParts.join('-')}.${parts.ext}`
}
