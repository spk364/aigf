import 'server-only'
import { env } from '@/shared/config/env'
import * as r2 from './r2'
import * as local from './local'

export type { UploadResult, R2KeyKind } from './r2'
export { buildR2Key } from './r2'

function resolveProvider(): 'r2' | 'local' {
  const explicit = process.env.STORAGE_PROVIDER
  if (explicit === 'r2') return 'r2'
  if (explicit === 'local') {
    if (env.NODE_ENV === 'production') {
      throw new Error('STORAGE_PROVIDER=local is not allowed in production')
    }
    return 'local'
  }

  const r2Ready = !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    env.R2_PUBLIC_URL
  )
  if (r2Ready) return 'r2'

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Storage: R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL.',
    )
  }
  return 'local'
}

export function getStorageProvider(): 'r2' | 'local' {
  return resolveProvider()
}

export async function uploadBuffer(opts: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
  cacheControl?: string
}) {
  return resolveProvider() === 'r2' ? r2.uploadBuffer(opts) : local.uploadBuffer(opts)
}

export async function mirrorFromUrl(opts: {
  sourceUrl: string
  destKey: string
  cacheControl?: string
}) {
  return resolveProvider() === 'r2' ? r2.mirrorFromUrl(opts) : local.mirrorFromUrl(opts)
}

export async function deleteObject(key: string): Promise<void> {
  return resolveProvider() === 'r2' ? r2.deleteObject(key) : local.deleteObject(key)
}
