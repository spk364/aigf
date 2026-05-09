// Public voice catalog endpoint.
//
// Returns the curated voice list (id, label, blurb, gender, vibe) along with
// a locale-specific preview URL. Previews are seeded into media-assets via
// `pnpm seed:voice-previews`; if a clip is missing for a (voiceId, locale)
// pair, `previewUrl` is null and the UI hides the ▶ button.

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  VOICE_CATALOG,
  toPublicVoice,
  type VoiceLocale,
} from '@/shared/ai/voice-catalog'

const SUPPORTED_LOCALES: VoiceLocale[] = ['en', 'ru', 'es']

function parseLocale(raw: string | null): VoiceLocale {
  if (raw && (SUPPORTED_LOCALES as string[]).includes(raw)) return raw as VoiceLocale
  return 'en'
}

export async function GET(req: NextRequest) {
  const locale = parseLocale(req.nextUrl.searchParams.get('locale'))

  const payload = await getPayload({ config })

  // One query for the whole catalog — keep limit comfortably above
  // VOICE_CATALOG.length × locales so we never paginate the lookup.
  const previews = await payload.find({
    collection: 'media-assets',
    where: {
      and: [
        { kind: { equals: 'voice_preview' } },
        { 'generationMetadata.locale': { equals: locale } },
        { deletedAt: { exists: false } },
      ],
    },
    limit: 200,
    overrideAccess: true,
  })

  const previewByVoiceId = new Map<string, string>()
  for (const doc of previews.docs) {
    const meta = (doc.generationMetadata ?? {}) as { voiceId?: string }
    if (meta.voiceId && doc.publicUrl) {
      // Keep the most recently created preview if there are duplicates.
      if (!previewByVoiceId.has(meta.voiceId)) {
        previewByVoiceId.set(meta.voiceId, doc.publicUrl)
      }
    }
  }

  const voices = VOICE_CATALOG.map((entry) =>
    toPublicVoice(entry, locale, previewByVoiceId.get(entry.id) ?? null),
  )

  return NextResponse.json(
    { locale, voices },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
  )
}
