/**
 * Regenerate character portraits via Atlas WAN 2.6 text-to-image and set them as
 * primary + reference. Use this (not backfill-character-images.ts) for sexy /
 * curvy characters: fast-sdxl's NSFW classifier black-frames them, and Atlas
 * with a body-focused prompt renders nude — so this forces a CLOTHED,
 * head-and-shoulders SFW portrait. Mirrors to R2 and soft-deletes the old asset.
 *
 *   # specific slugs:
 *   pnpm tsx --env-file-if-exists=.env.local scripts/regen-character-portraits.ts bella lola
 *   # auto-target every preset whose current portrait is a black/degenerate frame:
 *   pnpm tsx --env-file-if-exists=.env.local scripts/regen-character-portraits.ts --black-only
 *
 * Required env: DATABASE_URL, ATLAS_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL.
 */
import { Client } from 'pg'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1'
// A black/degenerate PNG is tiny; real 832×1216 portraits are >100 KB.
const BLACK_FRAME_MAX_BYTES = 35000
const argv = process.argv.slice(2)
const blackOnly = argv.includes('--black-only')
// --auto: every preset whose current portrait we generated ourselves
// (generation_metadata backfill/regen=true) — i.e. NOT admin-curated/uploaded
// references, so curated images are never overwritten.
const autoMode = argv.includes('--auto')
const slugs = argv.filter((a) => !a.startsWith('--'))

function env(n: string): string { const v = process.env[n]; if (!v) { console.error('missing ' + n); process.exit(1) } return v }

function buildPrompt(artStyle: string | null, appearance: any): string {
  // SFW catalog portrait: Atlas has no NSFW filter, and these characters'
  // appearance tokens trend explicit (curvy/large), so we MUST force clothing
  // and a head-and-shoulders crop or it renders nude. Drop appearancePrompt
  // (full-body, body-focused) in favour of a clothed bust portrait.
  // Stored subjectTokens from older seeds contain "beautiful detailed eyes",
  // which renders glowing neon irises. Strip it and assert natural eyes.
  const subject = ((appearance?.subjectTokens ?? 'beautiful young woman') as string)
    .replace(/,?\s*beautiful detailed eyes/gi, '')
    .trim()
    .replace(/,\s*$/, '')
    + ', natural realistic eyes, natural eye colour, no glowing eyes'
  const markers = appearance?.safetyAdultMarkers?.join(', ') ?? 'adult woman, (adult:1.3)'
  if (artStyle === 'anime') {
    return ['2D anime illustration, japanese anime style, cel-shaded, masterpiece, best quality',
      'head and shoulders portrait, upper body, face focus', subject,
      'wearing a cute stylish casual top, fully clothed, modest neckline',
      'warm smile, looking at viewer', 'plain studio background, soft lighting', markers].join(', ')
  }
  // Realistic → FLUX dev (natural-language). Atlas/SDXL over-saturate colored
  // irises into "acid"/neon eyes; FLUX renders true-to-life eyes and, on a
  // clothed SFW portrait, does not trip its NSFW black-frame.
  return ['Photorealistic head and shoulders studio portrait of', subject,
    'wearing a stylish fitted casual top, fully clothed, tasteful, modest neckline',
    'warm friendly smile, looking at camera, plain grey studio background, soft even lighting',
    'natural realistic eyes, true-to-life eye colour, no glowing eyes, realistic skin texture',
    markers].join(', ')
}

// FLUX dev via fal queue — used for realistic portraits (natural eyes).
async function fluxGen(prompt: string): Promise<string> {
  const key = env('FAL_KEY')
  const sub = await fetch('https://queue.fal.run/fal-ai/flux/dev', {
    method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: { width: 832, height: 1216 }, num_images: 1, num_inference_steps: 28, guidance_scale: 3.5, enable_safety_checker: false }),
  })
  if (!sub.ok) throw new Error(`flux submit ${sub.status}: ${(await sub.text()).slice(0, 200)}`)
  const d: any = await sub.json()
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > 120000) throw new Error('flux timeout')
    await new Promise((r) => setTimeout(r, 3000))
    const s: any = await (await fetch(d.status_url, { headers: { Authorization: `Key ${key}` } })).json()
    if (s.status === 'COMPLETED') { const r: any = await (await fetch(d.response_url, { headers: { Authorization: `Key ${key}` } })).json(); const u = r.images?.[0]?.url; if (!u) throw new Error('flux no image'); return u }
    if (s.status === 'FAILED' || s.status === 'ERROR') throw new Error('flux failed')
  }
}

async function atlasGen(prompt: string): Promise<string> {
  const key = env('ATLAS_API_KEY')
  const sub = await fetch(`${ATLAS_BASE}/model/generateImage`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'alibaba/wan-2.6/text-to-image', prompt, size: '832*1216' }),
  })
  if (!sub.ok) throw new Error(`atlas submit ${sub.status}: ${(await sub.text()).slice(0, 200)}`)
  const d: any = await sub.json(); const id = d.id ?? d.data?.id
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > 120000) throw new Error('atlas timeout')
    await new Promise((r) => setTimeout(r, 3000))
    const j: any = await (await fetch(`${ATLAS_BASE}/model/prediction/${id}`, { headers: { Authorization: `Bearer ${key}` } })).json()
    const node = j.data ?? j; const st = (node.status ?? '').toLowerCase()
    if (st === 'completed' || st === 'succeeded') { const u = node.outputs?.[0]; if (!u) throw new Error('no output'); return u }
    if (st === 'failed' || st === 'error') throw new Error('atlas failed: ' + JSON.stringify(node).slice(0, 200))
  }
}

async function main() {
  if (!slugs.length && !blackOnly && !autoMode) { console.error('pass slugs, --black-only, or --auto'); process.exit(1) }
  const c = new Client({ connectionString: env('DATABASE_URL') })
  await c.connect()

  let targets = slugs
  if (blackOnly) {
    const r = await c.query(
      `SELECT ch.slug FROM characters ch JOIN media_assets a ON a.id = ch.primary_image_id_id
       WHERE ch.kind='preset' AND ch.deleted_at IS NULL AND a.size_bytes < $1 ORDER BY ch.slug`,
      [BLACK_FRAME_MAX_BYTES],
    )
    targets = r.rows.map((x: any) => x.slug)
    console.log(`--black-only: ${targets.length} character(s) with a black/degenerate portrait: ${targets.join(', ') || '(none)'}`)
    if (!targets.length) { await c.end(); return }
  } else if (autoMode) {
    const r = await c.query(
      `SELECT ch.slug FROM characters ch JOIN media_assets a ON a.id = ch.primary_image_id_id
       WHERE ch.kind='preset' AND ch.deleted_at IS NULL
         AND ((a.generation_metadata->>'backfill')='true' OR (a.generation_metadata->>'regen')='true')
       ORDER BY ch.slug`,
    )
    targets = r.rows.map((x: any) => x.slug)
    console.log(`--auto: ${targets.length} auto-generated portrait(s) to regenerate: ${targets.join(', ') || '(none)'}`)
    if (!targets.length) { await c.end(); return }
  }
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') } })
  const bucket = env('R2_BUCKET'); const pub = env('R2_PUBLIC_URL').replace(/\/$/, '')

  for (const slug of targets) {
    try {
      const r = await c.query(`SELECT id, art_style, appearance, primary_image_id_id FROM characters WHERE slug=$1`, [slug])
      if (!r.rows.length) { console.log(`${slug}: not found`); continue }
      const ch = r.rows[0]
      const isAnime = ch.art_style === 'anime'
      const prompt = buildPrompt(ch.art_style, ch.appearance)
      let url = '', bytes = 0, body: Buffer = Buffer.alloc(0)
      for (let attempt = 1; attempt <= 2; attempt++) {
        // Realistic → FLUX dev (natural eyes); anime → Atlas WAN 2.6.
        url = isAnime ? await atlasGen(prompt) : await fluxGen(prompt)
        body = Buffer.from(await (await fetch(url)).arrayBuffer())
        bytes = body.byteLength
        if (bytes > 35000) break
        console.log(`${slug}: attempt ${attempt} small (${bytes}b), retrying`)
      }
      const k = `character-reference/${ch.id}/${randomUUID().slice(0, 8)}.png`
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: k, Body: body, ContentType: 'image/png', ContentLength: bytes, CacheControl: 'public, max-age=31536000, immutable' }))
      const publicUrl = `${pub}/${k}`
      const ins = await c.query(
        `INSERT INTO media_assets (kind, storage_key, storage_provider, public_url, mime_type, size_bytes, width, height, owner_character_id_id, generation_metadata, moderation_status, is_nsfw, created_at, updated_at)
         VALUES ('character_reference',$1,'r2',$2,'image/png',$3,832,1216,$4,$5,'pending',false,NOW(),NOW()) RETURNING id`,
        [k, publicUrl, bytes, ch.id, JSON.stringify({ endpoint: 'alibaba/wan-2.6/text-to-image', regen: true })],
      )
      const newId = ins.rows[0].id
      const oldId = ch.primary_image_id_id
      await c.query(`UPDATE characters SET primary_image_id_id=$1, reference_image_id_id=$1, reference_image_url=$2, updated_at=NOW() WHERE id=$3`, [newId, publicUrl, ch.id])
      if (oldId) await c.query(`UPDATE media_assets SET deleted_at=NOW() WHERE id=$1`, [oldId])
      console.log(`${slug}: OK asset #${newId} ${bytes}b ${publicUrl}`)
    } catch (e: any) {
      console.log(`${slug}: FAILED ${e.message}`)
    }
  }
  await c.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
