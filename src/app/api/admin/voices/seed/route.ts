// One-shot voice catalog seeder.
//
// Generates 24 preview clips (8 voices × 3 locales) via fal.ai MiniMax
// Speech-02 HD, mirrors them to whatever storage provider is configured
// (R2 in production), and writes media-assets rows tagged with
// kind=voice_preview + generationMetadata.{voiceId,locale}.
//
// Idempotent by default: a voice/locale pair with an active media-asset is
// skipped. Pass {"force": true} to regenerate (and soft-delete the previous
// row) so callers can recover from corrupted/local-storage seeds.
//
// Auth: admin role only — runs on Vercel and we don't want random users to
// burn fal.ai budget. Each call costs ~$0.13 (1300 chars total).
//
// Why an HTTP endpoint instead of just running scripts/seed-voice-previews.ts:
// the script runs on a developer machine where R2 may not be configured
// (R2_PUBLIC_URL etc. unset → falls back to local public/uploads). Hitting
// this route on a Vercel deployment guarantees R2 is in scope.

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { generateSpeech } from '@/shared/ai/tts'
import { VOICE_CATALOG, type VoiceLocale } from '@/shared/ai/voice-catalog'
import { persistGeneratedAudio } from '@/features/media/persist-generated-audio'
import { getStorageProvider } from '@/shared/storage'

const LOCALES: VoiceLocale[] = ['en', 'ru', 'es']

const bodySchema = z
  .object({
    // Regenerate clips that already exist. Soft-deletes the existing
    // media-asset row first so /api/voices picks up the new URL.
    force: z.boolean().default(false),
    // Limit to a single voice id for spot-fixes.
    voiceId: z.string().max(64).optional(),
    // Limit to a single locale for spot-fixes.
    locale: z.enum(['en', 'ru', 'es']).optional(),
  })
  .default({})

function isAdmin(user: { roles?: unknown } | null): boolean {
  if (!user) return false
  const roles = user.roles
  return Array.isArray(roles) && roles.includes('admin')
}

export async function POST(req: Request) {
  const user = (await getCurrentUser()) as ({ id: string | number; roles?: string[] } | null)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden_admin_only' }, { status: 403 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})))
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', details: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    )
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY not configured' }, { status: 500 })
  }

  const provider = getStorageProvider()
  // Refuse to seed into local storage on a real deployment — that's the
  // exact bug we're trying to recover from. On dev (NODE_ENV=development)
  // local storage is the only option and is fine for spot-checks.
  if (provider === 'local' && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'r2_not_configured', message: 'R2_* env vars missing in production runtime.' },
      { status: 500 },
    )
  }

  const payload = await getPayload({ config })

  const targets = VOICE_CATALOG.flatMap((v) =>
    LOCALES.filter((loc) => !body.locale || loc === body.locale)
      .filter(() => !body.voiceId || v.id === body.voiceId)
      .map((locale) => ({ voice: v, locale })),
  )

  const results: Array<{
    voiceId: string
    locale: VoiceLocale
    status: 'ok' | 'skipped' | 'failed'
    publicUrl?: string
    mediaAssetId?: string | number
    message?: string
  }> = []

  for (const { voice, locale } of targets) {
    try {
      const existing = await payload.find({
        collection: 'media-assets',
        where: {
          and: [
            { kind: { equals: 'voice_preview' } },
            { 'generationMetadata.voiceId': { equals: voice.id } },
            { 'generationMetadata.locale': { equals: locale } },
            { deletedAt: { exists: false } },
          ],
        },
        limit: 5,
        overrideAccess: true,
      })

      if (existing.docs.length > 0 && !body.force) {
        results.push({
          voiceId: voice.id,
          locale,
          status: 'skipped',
          publicUrl: existing.docs[0]!.publicUrl as string | undefined,
          mediaAssetId: existing.docs[0]!.id as string | number,
        })
        continue
      }

      // Force path: soft-delete every active dup so /api/voices switches to
      // the freshly created row immediately (it picks the most recent
      // active asset per voice/locale).
      if (body.force && existing.docs.length > 0) {
        for (const doc of existing.docs) {
          await payload.update({
            collection: 'media-assets',
            id: doc.id,
            data: { deletedAt: new Date().toISOString() },
            overrideAccess: true,
          })
        }
      }

      const speech = await generateSpeech({
        text: voice.previewText[locale],
        voiceId: voice.providerVoiceId,
        endpoint: voice.endpoint,
      })

      const persisted = await persistGeneratedAudio({
        payload,
        fromUrl: speech.audioUrl,
        contentType: speech.contentType,
        durationSec: speech.durationSec,
        kind: 'voice-preview',
        generationMetadata: {
          voiceId: voice.id,
          providerVoiceId: voice.providerVoiceId,
          endpoint: voice.endpoint,
          locale,
          requestId: speech.requestId,
          latencyMs: speech.latencyMs,
          previewText: voice.previewText[locale],
        },
      })

      results.push({
        voiceId: voice.id,
        locale,
        status: 'ok',
        publicUrl: persisted.publicUrl,
        mediaAssetId: persisted.mediaAssetId,
      })
    } catch (err) {
      results.push({
        voiceId: voice.id,
        locale,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const summary = {
    ok: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  return NextResponse.json({
    storageProvider: provider,
    summary,
    results,
  })
}
