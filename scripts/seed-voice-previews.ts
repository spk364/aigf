/**
 * One-shot generator for voice catalog previews.
 *
 * For every entry in src/shared/ai/voice-catalog.ts, generates a short MP3
 * preview clip per locale (EN/RU/ES) via fal.ai MiniMax Speech-02 HD,
 * uploads it to R2, and writes a media-assets row of kind="voice_preview".
 *
 * The picker UI looks up previews by (voiceId, locale) via /api/voices.
 *
 * Usage:
 *   pnpm tsx --env-file-if-exists=.env.local scripts/seed-voice-previews.ts          # dry run
 *   pnpm tsx --env-file-if-exists=.env.local scripts/seed-voice-previews.ts --confirm
 *   pnpm tsx --env-file-if-exists=.env.local scripts/seed-voice-previews.ts --confirm --voice=sweet_girl
 *   pnpm tsx --env-file-if-exists=.env.local scripts/seed-voice-previews.ts --confirm --locale=en
 *   pnpm tsx --env-file-if-exists=.env.local scripts/seed-voice-previews.ts --confirm --force  # regenerate even if exists
 *
 * Env required when --confirm: FAL_KEY, R2_*, DATABASE_URL, PAYLOAD_SECRET.
 */

import { getPayload } from 'payload'
import config from '@payload-config'
import { generateSpeech } from '../src/shared/ai/tts'
import { VOICE_CATALOG, type VoiceLocale } from '../src/shared/ai/voice-catalog'
import { persistGeneratedAudio } from '../src/features/media/persist-generated-audio'

const LOCALES: VoiceLocale[] = ['en', 'ru', 'es']

// MiniMax Speech-02 HD: $0.10 per 1k chars. Each preview averages ~80 chars
// → ~$0.008 per clip → 8 voices × 3 locales × $0.008 ≈ $0.20 total.
const COST_PER_1K_CHARS_USD = 0.1

type CliArgs = {
  confirm: boolean
  voice?: string
  locale?: VoiceLocale
  force: boolean
}

function parseArgs(): CliArgs {
  const args: CliArgs = { confirm: false, force: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--confirm') args.confirm = true
    else if (arg === '--force') args.force = true
    else if (arg.startsWith('--voice=')) args.voice = arg.split('=')[1]
    else if (arg.startsWith('--locale=')) {
      const v = arg.split('=')[1] as VoiceLocale
      if (LOCALES.includes(v)) args.locale = v
    }
  }
  return args
}

async function main() {
  const args = parseArgs()

  const targets = VOICE_CATALOG.flatMap((v) =>
    LOCALES.filter((loc) => !args.locale || loc === args.locale)
      .filter(() => !args.voice || v.id === args.voice)
      .map((locale) => ({ voice: v, locale })),
  )

  if (targets.length === 0) {
    console.log('Nothing to do (no voices matched --voice/--locale filters).')
    return
  }

  const totalChars = targets.reduce((acc, t) => acc + t.voice.previewText[t.locale].length, 0)
  const estCostUsd = (totalChars / 1000) * COST_PER_1K_CHARS_USD
  console.log(`Targets: ${targets.length} clips across ${VOICE_CATALOG.length} voices`)
  console.log(`Total chars: ${totalChars} → est cost ≈ $${estCostUsd.toFixed(3)}`)

  if (!args.confirm) {
    console.log('\nDRY RUN. Pass --confirm to actually generate.')
    for (const t of targets) {
      console.log(
        `  - ${t.voice.id} (${t.voice.providerVoiceId}) [${t.locale}] ` +
          `"${t.voice.previewText[t.locale].slice(0, 60)}…"`,
      )
    }
    return
  }

  if (!process.env.FAL_KEY) {
    console.error('FAL_KEY is required. Set it in .env.local.')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  let successes = 0
  let skipped = 0
  let failures = 0

  for (const { voice, locale } of targets) {
    const tag = `${voice.id}/${locale}`

    if (!args.force) {
      // Look up existing preview keyed by generationMetadata.{voiceId,locale}.
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
        limit: 1,
      })
      if (existing.docs.length > 0) {
        console.log(`[skip] ${tag} — already seeded (asset ${existing.docs[0]!.id})`)
        skipped += 1
        continue
      }
    }

    console.log(`[gen ] ${tag} → fal.ai MiniMax…`)
    try {
      const result = await generateSpeech({
        text: voice.previewText[locale],
        voiceId: voice.providerVoiceId,
        endpoint: voice.endpoint,
      })
      const persisted = await persistGeneratedAudio({
        payload,
        fromUrl: result.audioUrl,
        contentType: result.contentType,
        durationSec: result.durationSec,
        kind: 'voice-preview',
        generationMetadata: {
          voiceId: voice.id,
          providerVoiceId: voice.providerVoiceId,
          endpoint: voice.endpoint,
          locale,
          requestId: result.requestId,
          latencyMs: result.latencyMs,
          previewText: voice.previewText[locale],
        },
      })
      console.log(`[ok  ] ${tag} → ${persisted.publicUrl}`)
      successes += 1
    } catch (err) {
      console.error(`[fail] ${tag}: ${err instanceof Error ? err.message : String(err)}`)
      failures += 1
    }
  }

  console.log(`\nDone. ok=${successes} skipped=${skipped} failed=${failures}`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
