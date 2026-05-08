/**
 * One-shot generator for character-builder option preview images.
 *
 * For every option in src/features/builder/options.ts that declares an
 * `imagePath` of the form `/builder/{category}/{value}.jpg`, this script
 * crafts a focused prompt that *isolates* that single attribute and saves
 * the rendered JPG to `public/builder/{category}/{value}.jpg`.
 *
 * Provider: Atlas Cloud (`alibaba/wan-2.6/text-to-image`) — NSFW-friendly,
 * no platform-level prompt classifier. Atlas's image API has no negative
 * prompt support, so safety is baked into the positive prompt via
 * `(adult:1.3), (18+:1.3), legal age` markers. The cards are intentionally
 * young-adult and seductive (joi-style); breast-size and butt-size cards
 * frame just the body part in lingerie (no face) so users see what the
 * choice actually does.
 *
 * Usage:
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --category=hair-color
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --category=breast-size --value=huge --force
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --concurrency=4
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --force --clean
 *
 * Default is DRY-RUN: prints the plan + estimated cost, makes no API calls.
 * Pass --confirm to actually fire. --force regenerates files that already exist.
 * Pass --clean to delete every existing .jpg in the planned categories first
 *   (covers stale option values that are no longer in options.ts). Implies --force.
 *
 * Env required when --confirm: ATLAS_API_KEY.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ART_STYLES,
  ETHNICITIES,
  AGE_RANGES,
  BODY_TYPES,
  BREAST_SIZES,
  BUTT_SIZES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  ARCHETYPES,
  OCCUPATIONS,
  STARTING_RELATIONSHIPS,
  type BuilderOption,
} from '../src/features/builder/options'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1'
const ATLAS_MODEL = 'alibaba/wan-2.6/text-to-image'
const COST_PER_IMAGE_USD = 0.021
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 180_000

const PUBLIC_BUILDER_DIR = path.resolve(process.cwd(), 'public/builder')

// Categories that used to exist in options.ts and no longer do — every .jpg
// in these dirs is dead weight, so --clean nukes the whole subdirectory.
// Keep the list in sync with options.ts removals.
const STALE_DIRS_TO_PURGE = [
  'features',
  'hip-shape',
  'meet-scenario',
  'relationship-stage',
  'skin-tone',
]

// ── Safety markers baked into every positive prompt ──────────────────────
//
// Atlas's image API doesn't accept a negative_prompt field — it's strictly
// `model + prompt + size + seed`. So instead of pushing back via negatives
// we anchor strongly with high-weight age markers in the *positive* prompt.
//
// Policy bumped from 18+ → 21+ for realistic output (2026-05-08): the option
// cards are all rendered photorealistic, so they share the realistic-channel
// floor. The single exception is the anime art-style card itself, which uses
// 18+ to keep the joi-style stylised young-adult vibe — see ANIME_SAFETY_POS.
const SAFETY_POS = '(adult woman:1.3), (21+ years old:1.4), (legal age:1.2)'
const ANIME_SAFETY_POS = '(adult woman:1.3), (18+ years old:1.3), (legal age:1.2)'
const QUALITY = 'detailed, sharp focus, 8k uhd, professional photography, soft cinematic lighting'

// ── CLI ────────────────────────────────────────────────────────────────────

type Args = {
  confirm: boolean
  category: string | null
  value: string | null
  force: boolean
  clean: boolean
  concurrency: number
}

function parseArgs(): Args {
  const out: Args = {
    confirm: false,
    category: null,
    value: null,
    force: false,
    clean: false,
    concurrency: 3,
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--confirm') out.confirm = true
    else if (a === '--force') out.force = true
    else if (a === '--clean') {
      out.clean = true
      out.force = true // --clean implies regenerate-everything
    }
    else if (a.startsWith('--category=')) out.category = a.slice('--category='.length) || null
    else if (a.startsWith('--value=')) out.value = a.slice('--value='.length) || null
    else if (a.startsWith('--concurrency=')) {
      const n = Number(a.slice('--concurrency='.length))
      if (Number.isFinite(n) && n > 0) out.concurrency = Math.min(8, Math.max(1, Math.floor(n)))
    }
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

// ── Job model ──────────────────────────────────────────────────────────────

type Job = {
  category: string
  value: string
  prompt: string
  destPath: string
  imageSize: { width: number; height: number }
}

const PORTRAIT_SIZE = { width: 832, height: 1216 }
const SQUARE_SIZE = { width: 1024, height: 1024 }

// ── Per-category prompt builders ──────────────────────────────────────────
//
// Default subject anchors a 22-year-old young woman (above the realistic-
// channel 21+ minimum, still well below the "mature adult" failure mode
// that older generations had). Anime art-style card uses its own 19-year-
// old anchor to stay legibly anime-young-adult.
// Pose tone is consistently joi-style: alluring, confident, fashion-editorial.

const SUBJECT_YOUNG = '1girl, solo, beautiful young woman, (22 year old:1.3), young adult, soft fresh face, ' + SAFETY_POS
const SUBJECT_YOUNG_ANIME = '1girl, solo, beautiful young woman, (19 year old:1.3), young adult, soft fresh face, ' + ANIME_SAFETY_POS
const POSE_ALLURING = 'alluring confident pose, sultry expression, soft seductive smile, looking at camera with playful eyes'
const STUDIO_BG = 'soft studio background with warm pink rim light, cinematic bokeh'

function destFor(category: string, value: string): string {
  return path.join(PUBLIC_BUILDER_DIR, category, `${value}.jpg`)
}

function artStyleJob(o: BuilderOption): Job {
  const style = o.promptFragment ?? 'photorealistic, high detail'
  // Anime art-style card is rendered at the anime channel's 18+ floor; all
  // other (realistic) cards default to the 22yo subject.
  const subject = o.value === 'anime' ? SUBJECT_YOUNG_ANIME : SUBJECT_YOUNG
  return {
    category: 'art-style',
    value: o.value,
    prompt: `${style}, ${subject}, head and shoulders portrait, lacy black top, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('art-style', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function ethnicityJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} features`
  return {
    category: 'ethnicity',
    value: o.value,
    prompt: `photorealistic editorial portrait, ${SUBJECT_YOUNG}, (${fragment}:1.4), elegant lacy lingerie top, head and shoulders, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('ethnicity', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function ageJob(o: typeof AGE_RANGES[number]): Job {
  // Age cards have to actually look the chosen age — but we still keep the
  // overall vibe young-adult & seductive so all option cards feel cohesive.
  // Floor the rendered age at 21 (realistic channel minimum) regardless of
  // what AGE_RANGES says, in case a future bucket dips below.
  const renderedAge = Math.max(21, o.defaultAge)
  return {
    category: 'age',
    value: o.value,
    prompt: `photorealistic editorial portrait, 1girl, solo, beautiful woman, (${renderedAge} year old:1.5), elegant lingerie top, head and shoulders, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}, ${SAFETY_POS}`,
    destPath: destFor('age', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function bodyTypeJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} build`
  return {
    category: 'body-type',
    value: o.value,
    prompt: `photorealistic full body shot, ${SUBJECT_YOUNG}, (${fragment}:1.4), matching lingerie set, head to toe, ${POSE_ALLURING}, slight contrapposto, hand on hip, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('body-type', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

// Breast-size cards focus on the chest in pretty lingerie. No face — the
// preview is meant to communicate the size choice, nothing more.
function breastSizeJob(o: BuilderOption): Job {
  const map: Record<string, string> = {
    flat: '(very flat chest:1.6), (AA cup:1.4), tiny breasts, delicate athletic chest, no cleavage',
    small: '(small A cup breasts:1.5), (petite perky chest:1.4), small modest bust',
    average: '(modest medium B cup breasts:1.4), natural everyday chest size, neither small nor large, balanced shape',
    big: '(large D cup breasts:1.5), full busty chest, generous curves',
    huge: '(huge DDD cup breasts:1.7), (extremely large busty chest:1.5), voluptuous, very generous curves',
  }
  const sizeFragment = map[o.value] ?? '(medium breasts:1.3)'
  return {
    category: 'breast-size',
    value: o.value,
    // Cropped to neckline → waist. No face. Focus is the chest in lacy lingerie.
    prompt:
      `photorealistic close-up cropped photograph, female chest and torso only, head out of frame, ` +
      `young adult woman, (22 year old:1.2), ${SAFETY_POS}, ${sizeFragment}, ` +
      `wearing delicate lacy lingerie bra, soft skin, tasteful boudoir lighting, warm bokeh, ` +
      `professional fashion photography, ${QUALITY}`,
    destPath: destFor('breast-size', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

// Butt-size cards focus on the lower-back / hips / butt in pretty lingerie.
// Side or back view — no face, just the body part.
function buttSizeJob(o: BuilderOption): Job {
  const map: Record<string, string> = {
    slim: '(very slim narrow hips:1.6), (very small flat butt:1.4), straight athletic figure, no curves',
    small: '(small petite butt:1.5), narrow hips, slim figure, modest rear',
    athletic: '(athletic firm round rear:1.5), (toned sculpted glutes:1.4), fit body, gym-shaped',
    big: '(large round full butt:1.6), curvy wide hips, hourglass curves',
    huge: '(massive huge bubble butt:1.8), (extremely thick wide hips:1.6), thick thighs, exaggerated curves, bbw lower body',
  }
  const sizeFragment = map[o.value] ?? '(medium butt:1.3)'
  return {
    category: 'butt-size',
    value: o.value,
    // Back view from waist down to upper thighs. No face, no upper body.
    prompt:
      `photorealistic close-up cropped photograph, female lower back hips and butt only, ` +
      `back view from waist to upper thighs, head and upper body out of frame, ` +
      `young adult woman, (22 year old:1.2), ${SAFETY_POS}, ${sizeFragment}, ` +
      `wearing delicate lacy lingerie panties, soft skin, tasteful boudoir lighting, warm bokeh, ` +
      `professional fashion photography, ${QUALITY}`,
    destPath: destFor('butt-size', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function hairColorJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-color',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT_YOUNG}, (${fragment}:1.5), medium length hair, head and shoulders, lacy lingerie top, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('hair-color', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function hairLengthJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-length',
    value: o.value,
    prompt: `photorealistic cowboy shot, ${SUBJECT_YOUNG}, (${fragment}:1.5), brown hair, lacy lingerie top, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('hair-length', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function hairStyleJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-style',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT_YOUNG}, (${fragment}:1.4), brown hair, head and shoulders, lacy lingerie top, ${POSE_ALLURING}, ${STUDIO_BG}, ${QUALITY}`,
    destPath: destFor('hair-style', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function eyeColorJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} eyes`
  return {
    category: 'eye-color',
    value: o.value,
    prompt: `photorealistic extreme close up of a face, ${SUBJECT_YOUNG}, (${fragment}:1.6), highly detailed eyes, soft seductive expression, looking at camera, ${QUALITY}`,
    destPath: destFor('eye-color', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function archetypeJob(o: BuilderOption): Job {
  // Mood-specific cues — turn the archetype's defining vibe into a visible
  // expression / wardrobe / lighting choice. All rendered as young-adult
  // (19yo) seductive editorial portraits.
  const moodMap: Record<string, string> = {
    sweet_girlfriend:
      'warm gentle smile, cozy oversized cardigan unbuttoned, golden hour soft lighting, dreamy romantic mood',
    adventurous_spirit:
      'confident grin, leather jacket over a crop top, neon city backdrop, energetic mood',
    mysterious_one:
      'subtle smirk, sheer black lace top, low-key moody lighting, deep shadows',
    confident_leader:
      'direct sultry gaze, sharp business attire half unbuttoned, studio key light, powerful posture',
    shy_romantic:
      'soft blush looking down through her lashes, pastel pink lingerie cardigan, dreamy soft lighting',
    intellectual:
      'thoughtful playful smile, oversized button-up open over a cami, library bookshelf background, warm reading light',
    free_spirit:
      'carefree smile, bohemian crochet top, sunlit meadow, golden hour',
    caretaker:
      'warm caring sultry smile, soft pastel silk slip, bedroom window light',
    dominant_temptress:
      'confident sultry expression, black leather lingerie set, dramatic studio lighting, dark red lipstick',
    playful_brat:
      'playful smirk biting lip, casual crop top and short skirt, neon pink rim lighting, mischievous mood',
    custom:
      'soft seductive expression, lacy lingerie, plain warm background, soft lighting',
  }
  const mood = moodMap[o.value] ?? moodMap.custom!
  return {
    category: 'archetype',
    value: o.value,
    prompt: `photorealistic editorial portrait, ${SUBJECT_YOUNG}, ${mood}, head and shoulders, ${QUALITY}`,
    destPath: destFor('archetype', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function occupationJob(o: BuilderOption): Job {
  const sceneMap: Record<string, string> = {
    massage_therapist: 'in a candlelit spa room, white silk robe loosely tied, massage table behind, soft warm lighting',
    fitness_coach: 'in a modern gym, sports bra and yoga shorts, mid-pose stretching, soft daylight',
    secretary: 'in a modern office at a desk, tight pencil skirt and unbuttoned silk blouse, glasses on her nose',
    flight_attendant: 'in a tailored flight attendant uniform inside an airplane cabin, leaning slightly with a soft smile',
    librarian: 'in a library, cardigan over a fitted dress, book in hand, warm reading light',
    doctor: 'in an unbuttoned white doctor coat over fitted clothes, hospital corridor background, stethoscope around her neck',
    nurse: 'in a fitted nurse outfit, hospital background, soft lighting, warm smile',
    police_officer: 'in a tight police uniform, urban night background with neon lights, confident pose',
    teacher: 'standing by a chalkboard in a classroom, fitted dress, glasses, warm smile, smart casual outfit',
    student: 'on a university campus with a backpack over one shoulder, plaid skirt and sweater, bright daylight',
    artist: 'in an artist studio, paint-stained tank top tied at the waist, easel behind, warm window light',
    lawyer: 'in a law-firm office, sharp tailored business suit half unbuttoned, glass-walled background',
    streamer: 'in a streaming setup with RGB lighting and a headset, oversized hoodie crop, playful smile',
    actress: 'on a red carpet in a glamorous evening gown with a high slit, golden glamour lighting',
    model: 'on a fashion runway in a designer outfit, editorial flash lighting, confident walk',
    custom: 'in a chic casual outfit, with a friendly playful smile, plain warm background, soft lighting',
  }
  const scene = sceneMap[o.value] ?? sceneMap.custom!
  return {
    category: 'occupation',
    value: o.value,
    prompt: `photorealistic full body shot, ${SUBJECT_YOUNG}, ${scene}, ${POSE_ALLURING}, ${QUALITY}`,
    destPath: destFor('occupation', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

// ── Build all jobs ─────────────────────────────────────────────────────────

function buildAllJobs(): Job[] {
  return [
    ...ART_STYLES.map(artStyleJob),
    ...ETHNICITIES.map(ethnicityJob),
    ...AGE_RANGES.map(ageJob),
    ...BODY_TYPES.map(bodyTypeJob),
    ...BREAST_SIZES.map(breastSizeJob),
    ...BUTT_SIZES.map(buttSizeJob),
    ...HAIR_COLORS.map(hairColorJob),
    ...HAIR_LENGTHS.map(hairLengthJob),
    ...HAIR_STYLES.map(hairStyleJob),
    ...EYE_COLORS.map(eyeColorJob),
    ...ARCHETYPES.map(archetypeJob),
    ...OCCUPATIONS.filter((o) => o.value !== 'custom').map(occupationJob),
  ]
}

// Reference STARTING_RELATIONSHIPS so the import isn't reported as unused
// (chip-only UI; intentionally no images for that category).
void STARTING_RELATIONSHIPS

// ── Atlas Cloud client ────────────────────────────────────────────────────

type AtlasImage = { url: string }

async function generateOne(opts: {
  prompt: string
  imageSize: { width: number; height: number }
  atlasKey: string
}): Promise<AtlasImage> {
  // Atlas only accepts model/prompt/size/seed at root. No negative_prompt
  // and no safety flags — spicy variants have no platform filter by design.
  const submitRes = await fetch(`${ATLAS_BASE}/model/generateImage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.atlasKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ATLAS_MODEL,
      prompt: opts.prompt,
      size: `${opts.imageSize.width}*${opts.imageSize.height}`,
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`atlas submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`)
  }
  const submit = (await submitRes.json()) as {
    id?: string
    data?: { id?: string }
  }
  const id = submit.id ?? submit.data?.id
  if (!id) throw new Error('atlas submit returned no id')

  const statusUrl = `${ATLAS_BASE}/model/prediction/${id}`
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const sRes = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${opts.atlasKey}` },
    })
    if (!sRes.ok) {
      const body = await sRes.text().catch(() => '')
      // Atlas wraps upstream 4xx as 500 — terminal, don't keep polling.
      if (/unexpected http status code:\s*4\d\d/i.test(body)) {
        throw new Error(`atlas worker rejected input: ${body.slice(0, 300)}`)
      }
      continue
    }
    const json = (await sRes.json()) as {
      data?: { id?: string; status?: string; outputs?: string[]; error?: string }
      status?: string
      outputs?: string[]
      error?: string
    }
    const node = json.data ?? json
    const status = (node.status ?? '').toLowerCase()
    if (status === 'completed' || status === 'succeeded') {
      const outputs = node.outputs ?? []
      if (outputs.length === 0) throw new Error('atlas completed with empty outputs[]')
      return { url: outputs[0]! }
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`atlas job ${status}: ${node.error ?? '(no error message)'}`)
    }
  }
  throw new Error(`atlas timeout after ${POLL_TIMEOUT_MS}ms`)
}

async function downloadJpeg(fromUrl: string, destPath: string): Promise<number> {
  const res = await fetch(fromUrl)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  await fs.writeFile(destPath, buf)
  return buf.byteLength
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

// ── Concurrency-bounded runner ────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) return
      await worker(items[idx]!, idx)
    }
  })
  await Promise.all(workers)
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  let jobs = buildAllJobs()

  if (args.category) jobs = jobs.filter((j) => j.category === args.category)
  if (args.value) jobs = jobs.filter((j) => j.value === args.value)

  // Skip jobs whose target file already exists, unless --force.
  const filtered: Job[] = []
  for (const j of jobs) {
    if (!args.force && (await fileExists(j.destPath))) continue
    filtered.push(j)
  }

  // --clean: delete every existing .jpg in the touched categories so stale
  // option values (e.g. an option that was renamed in options.ts) don't sit
  // around alongside the regenerated set. Only runs once we're committed to
  // generating (--confirm), and always before the API calls.
  const categoriesToClean = Array.from(new Set(filtered.map((j) => j.category)))
  let cleanedCount = 0

  console.log(`\nBuilder option-image generator`)
  console.log(`  total options:   ${jobs.length}`)
  console.log(`  to generate:     ${filtered.length}${args.force ? ' (--force)' : ' (skipping existing)'}`)
  console.log(`  endpoint:        ${ATLAS_MODEL} (Atlas Cloud)`)
  console.log(`  concurrency:     ${args.concurrency}`)
  console.log(`  est. cost:       $${(filtered.length * COST_PER_IMAGE_USD).toFixed(2)}`)
  if (args.category) console.log(`  category filter: ${args.category}`)
  if (args.value) console.log(`  value filter:    ${args.value}`)
  if (args.clean) {
    console.log(`  clean:           DELETE every .jpg in ${categoriesToClean.length} categories first`)
  }

  if (filtered.length === 0) {
    console.log(`\nNothing to do.\n`)
    return
  }

  if (!args.confirm) {
    console.log(`\n[DRY RUN] No API calls. Re-run with --confirm to actually generate.\n`)
    console.log(`First 5 planned jobs:`)
    for (const j of filtered.slice(0, 5)) {
      console.log(`  · ${j.category}/${j.value}.jpg`)
      console.log(`      prompt: ${j.prompt.slice(0, 200)}…`)
    }
    return
  }

  const atlasKey = requireEnv('ATLAS_API_KEY')

  if (args.clean) {
    for (const cat of categoriesToClean) {
      const dir = path.join(PUBLIC_BUILDER_DIR, cat)
      try {
        const entries = await fs.readdir(dir)
        for (const name of entries) {
          if (!name.endsWith('.jpg')) continue
          await fs.unlink(path.join(dir, name))
          cleanedCount++
        }
      } catch (e) {
        // Directory may not exist yet — that's fine, mkdir happens on download.
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
    // Nuke the legacy stale category dirs (no longer in options.ts) entirely.
    let purgedDirs = 0
    for (const stale of STALE_DIRS_TO_PURGE) {
      const dir = path.join(PUBLIC_BUILDER_DIR, stale)
      try {
        await fs.rm(dir, { recursive: true, force: true })
        purgedDirs++
      } catch {
        // Best-effort.
      }
    }
    console.log(
      `Cleaned ${cleanedCount} .jpg files from ${categoriesToClean.length} active categories` +
        (purgedDirs > 0 ? `; purged ${purgedDirs} stale dirs (${STALE_DIRS_TO_PURGE.join(', ')})` : '') +
        `.\n`,
    )
  }

  let ok = 0
  let failed = 0
  const startedAt = Date.now()

  await runWithConcurrency(filtered, args.concurrency, async (job, idx) => {
    const tag = `[${idx + 1}/${filtered.length}] ${job.category}/${job.value}`
    try {
      const img = await generateOne({
        prompt: job.prompt,
        imageSize: job.imageSize,
        atlasKey,
      })
      const sizeBytes = await downloadJpeg(img.url, job.destPath)
      ok++
      console.log(`${tag} ✓ ${(sizeBytes / 1024).toFixed(0)} KB`)
    } catch (e) {
      failed++
      console.error(`${tag} ✗ ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0)
  console.log(`\nDone in ${elapsedSec}s · ok=${ok} · failed=${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
