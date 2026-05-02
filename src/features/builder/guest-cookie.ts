import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const GUEST_DRAFT_COOKIE = 'gfai_guest_draft'
const COOKIE_TTL_SECONDS = 24 * 60 * 60

export type GuestPreviewEntry = {
  mediaAssetId: string
  publicUrl: string
  generatedAt: string
}

export type GuestDraft = {
  appearance: Record<string, unknown>
  previews: GuestPreviewEntry[]
  selectedMediaAssetId: string | null
  language: 'en' | 'ru' | 'es'
  createdAt: string
}

function getSecret(): string {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set')
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

function encode(draft: GuestDraft): string {
  const json = JSON.stringify(draft)
  const body = Buffer.from(json, 'utf8').toString('base64url')
  const sig = sign(body)
  return `${body}.${sig}`
}

function decode(raw: string): GuestDraft | null {
  const dot = raw.indexOf('.')
  if (dot < 0) return null
  const body = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = sign(body)
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8')
    return JSON.parse(json) as GuestDraft
  } catch {
    return null
  }
}

export async function readGuestDraft(): Promise<GuestDraft | null> {
  const store = await cookies()
  const raw = store.get(GUEST_DRAFT_COOKIE)?.value
  if (!raw) return null
  const draft = decode(raw)
  if (!draft) return null
  // Reject expired drafts.
  const created = Date.parse(draft.createdAt)
  if (!Number.isFinite(created)) return null
  if (Date.now() - created > COOKIE_TTL_SECONDS * 1000) return null
  return draft
}

export async function writeGuestDraft(draft: GuestDraft): Promise<void> {
  const store = await cookies()
  store.set(GUEST_DRAFT_COOKIE, encode(draft), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function clearGuestDraft(): Promise<void> {
  const store = await cookies()
  store.delete(GUEST_DRAFT_COOKIE)
}
