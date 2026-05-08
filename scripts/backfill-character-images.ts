/**
 * One-shot backfill: for every preset character without primary_image_id_id,
 * generate a portrait via fal-ai/fast-sdxl, mirror to R2, INSERT into
 * media_assets, UPDATE characters set primary_image_id_id + reference_image_id_id.
 *
 * Uses raw pg + S3 (no Payload SDK) so it side-steps the
 * `payload/dist/bin/loadEnv.js` incompatibility with the current Next.js
 * version that breaks `pnpm tsx … src/payload/seed/*.ts`.
 *
 * Default: DRY-RUN — prints plan and estimated cost. Pass --confirm to fire.
 *
 *   pnpm tsx --env-file-if-exists=.env.local scripts/backfill-character-images.ts
 *   pnpm tsx --env-file-if-exists=.env.local scripts/backfill-character-images.ts --confirm
 *   pnpm tsx --env-file-if-exists=.env.local scripts/backfill-character-images.ts --slug=mia --confirm
 *   pnpm tsx --env-file-if-exists=.env.local scripts/backfill-character-images.ts --limit=3 --confirm
 *
 * Required env: DATABASE_URL, FAL_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL.
 */

import { Client } from 'pg'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'

const FAL_ENDPOINT_FAST_SDXL = 'fal-ai/fast-sdxl'
const COST_PER_IMAGE_USD = 0.025
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 180_000

const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), (school uniform:1.3), ' +
  '(petite:1.2), (small:1.2), (flat chest:1.4), (underage:1.5), (minor:1.5), ' +
  '(childlike features:1.5), deformed, low quality, multiple people, bad anatomy'

type Args = {
  confirm: boolean
  limit: number | null
  slug: string | null
}

function parseArgs(): Args {
  const out: Args = { confirm: false, limit: null, slug: null }
  for (const a of process.argv.slice(2)) {
    if (a === '--confirm') out.confirm = true
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice('--limit='.length)) || null
    else if (a.startsWith('--slug=')) out.slug = a.slice('--slug='.length) || null
  }
  return out
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

type Candidate = {
  id: number
  slug: string | null
  artStyle: string | null
  appearance: {
    appearancePrompt?: string
    subjectTokens?: string
    safetyAdultMarkers?: string[]
  } | null
}

function buildPrompt(c: Candidate): string {
  const isAnime = c.artStyle === 'anime'
  // Match the runtime policy: realistic → 21+, anime → 18+ (see age-safety.ts).
  const fallbackMarkers = isAnime
    ? 'adult woman, (adult:1.3), (18+ years old:1.3), (legal age:1.2)'
    : 'adult woman, (adult:1.3), (21+ years old:1.4), (legal age:1.2)'
  const safetyMarkers = c.appearance?.safetyAdultMarkers?.join(', ') ?? fallbackMarkers
  const subject = c.appearance?.subjectTokens ?? 'beautiful young woman'
  if (isAnime) {
    return [
      'anime style, masterpiece, best quality, character reference sheet',
      subject,
      'neutral expression, slight smile, looking at viewer',
      'simple casual outfit, plain white background, soft even lighting',
      'clean lines',
      safetyMarkers,
    ]
      .filter(Boolean)
      .join(', ')
  }
  if (c.appearance?.appearancePrompt) {
    return [c.appearance.appearancePrompt, safetyMarkers].filter(Boolean).join(', ')
  }
  return [
    'RAW photo, studio portrait',
    subject,
    'neutral expression, slight smile, looking directly at camera',
    'casual clothing, simple outfit, studio gray background',
    'soft even lighting, no shadows, professional portrait photography',
    safetyMarkers,
    '8k uhd, sharp focus, high detail',
  ]
    .filter(Boolean)
    .join(', ')
}

async function generateOne(opts: {
  prompt: string
  falKey: string
}): Promise<{ url: string; width: number; height: number; contentType: string }> {
  const submitRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT_FAST_SDXL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${opts.falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      negative_prompt: SAFETY_NEGATIVE,
      image_size: { width: 832, height: 1216 },
      num_images: 1,
      num_inference_steps: 30,
      guidance_scale: 6,
      enable_safety_checker: false,
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`fal submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`)
  }
  const submit = (await submitRes.json()) as {
    request_id: string
    status_url: string
    response_url: string
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const sRes = await fetch(submit.status_url, {
      headers: { Authorization: `Key ${opts.falKey}` },
    })
    if (!sRes.ok) continue
    const s = (await sRes.json()) as { status: string }
    if (s.status === 'COMPLETED') {
      const rRes = await fetch(submit.response_url, {
        headers: { Authorization: `Key ${opts.falKey}` },
      })
      const result = (await rRes.json()) as {
        images?: Array<{ url: string; width: number; height: number; content_type?: string }>
        image?: { url: string; width: number; height: number; content_type?: string }
        detail?: string
      }
      if (result.detail) throw new Error(`fal failed: ${result.detail}`)
      const img = result.images?.[0] ?? result.image
      if (!img?.url) throw new Error('fal returned no image')
      return {
        url: img.url,
        width: img.width,
        height: img.height,
        contentType: img.content_type ?? 'image/jpeg',
      }
    }
    if (s.status === 'FAILED' || s.status === 'ERROR') {
      throw new Error(`fal job ${s.status}`)
    }
  }
  throw new Error(`fal timeout after ${POLL_TIMEOUT_MS}ms`)
}

async function mirrorToR2(opts: {
  s3: S3Client
  bucket: string
  publicUrlBase: string
  fromUrl: string
  characterId: number
}): Promise<{ key: string; publicUrl: string; sizeBytes: number; contentType: string }> {
  const res = await fetch(opts.fromUrl)
  if (!res.ok) throw new Error(`mirror fetch failed ${res.status}`)
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  const body = Buffer.from(await res.arrayBuffer())
  const ext =
    ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : ct === 'image/avif' ? 'avif' : 'jpg'
  const shortId = randomUUID().slice(0, 8)
  const key = `character-reference/${opts.characterId}/${shortId}.${ext}`
  await opts.s3.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: key,
      Body: body,
      ContentType: ct,
      ContentLength: body.byteLength,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return {
    key,
    publicUrl: `${opts.publicUrlBase}/${key}`,
    sizeBytes: body.byteLength,
    contentType: ct,
  }
}

async function main() {
  const args = parseArgs()
  // Only DATABASE_URL is needed for the dry-run plan; R2 + FAL are required
  // when --confirm actually triggers generation.
  const databaseUrl = requireEnv('DATABASE_URL')

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  // Find candidates: preset, published, no primary_image_id_id, not deleted.
  const params: unknown[] = []
  let sql = `
    SELECT c.id, c.slug, c.art_style AS "artStyle", c.appearance
    FROM characters c
    WHERE c.kind = 'preset'
      AND c.is_published = true
      AND c.deleted_at IS NULL
      AND c.primary_image_id_id IS NULL
  `
  if (args.slug) {
    params.push(args.slug)
    sql += ` AND c.slug = $${params.length}`
  }
  sql += ` ORDER BY c.display_order NULLS LAST, c.id`

  const result = await client.query<Candidate>(sql, params)
  const all = result.rows
  const candidates = args.limit && args.limit > 0 ? all.slice(0, args.limit) : all

  console.log(
    `\nPreset characters without a primary image: ${all.length}` +
      (args.slug ? ` (filtered by slug=${args.slug})` : '') +
      (args.limit ? ` · limit=${args.limit}` : ''),
  )
  for (const c of candidates) {
    console.log(`  - ${c.slug} (${c.artStyle ?? 'realistic'}) · id=${c.id}`)
  }

  const estMax = candidates.length * COST_PER_IMAGE_USD
  console.log(
    `\nWill generate via fal-ai/fast-sdxl × 1 image each (832×1216).\n` +
      `Max estimated cost: $${estMax.toFixed(2)} (≈ $${COST_PER_IMAGE_USD} × ${candidates.length}).`,
  )

  if (!args.confirm) {
    console.log('\n[DRY RUN] No fal calls made. Re-run with --confirm to actually generate.\n')
    await client.end()
    return
  }
  if (candidates.length === 0) {
    console.log('\nNothing to do.\n')
    await client.end()
    return
  }

  const falKey = requireEnv('FAL_KEY')
  const r2AccountId = requireEnv('R2_ACCOUNT_ID')
  const r2AccessKeyId = requireEnv('R2_ACCESS_KEY_ID')
  const r2SecretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
  const r2Bucket = requireEnv('R2_BUCKET')
  const r2PublicUrl = requireEnv('R2_PUBLIC_URL').replace(/\/$/, '')

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  let ok = 0
  let failed = 0
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!
    console.log(`\n[${i + 1}/${candidates.length}] ${c.slug} (${c.artStyle ?? 'realistic'}) — submitting…`)
    try {
      const prompt = buildPrompt(c)
      const img = await generateOne({ prompt, falKey })
      console.log(`   ✓ generated · uploading to R2…`)
      const upload = await mirrorToR2({
        s3,
        bucket: r2Bucket,
        publicUrlBase: r2PublicUrl,
        fromUrl: img.url,
        characterId: c.id,
      })

      // INSERT media_assets row.
      const insertRes = await client.query<{ id: number }>(
        `INSERT INTO media_assets (
          kind, storage_key, storage_provider, public_url,
          mime_type, size_bytes, width, height,
          owner_character_id_id, generation_metadata,
          moderation_status, is_nsfw, created_at, updated_at
        ) VALUES (
          'character_reference', $1, 'r2', $2,
          $3, $4, $5, $6,
          $7, $8,
          'pending', false, NOW(), NOW()
        ) RETURNING id`,
        [
          upload.key,
          upload.publicUrl,
          upload.contentType,
          upload.sizeBytes,
          img.width,
          img.height,
          c.id,
          JSON.stringify({
            endpoint: FAL_ENDPOINT_FAST_SDXL,
            prompt,
            backfill: true,
          }),
        ],
      )
      const mediaAssetId = insertRes.rows[0]!.id

      // UPDATE characters: set both primary and reference, plus
      // denormalized referenceImageUrl.
      await client.query(
        `UPDATE characters SET
           primary_image_id_id = $1,
           reference_image_id_id = $1,
           reference_image_url = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [mediaAssetId, upload.publicUrl, c.id],
      )

      console.log(`   ✓ saved · asset #${mediaAssetId} · ${upload.publicUrl}`)
      ok++
    } catch (err) {
      failed++
      console.error(`   ✗ failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await client.end()
  console.log(`\nDone. Succeeded: ${ok}, failed: ${failed}, of ${candidates.length} candidates.\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
