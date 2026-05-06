/**
 * One-shot generator for character-builder option preview images.
 *
 * For every option in src/features/builder/options.ts that declares an
 * `imagePath` of the form `/builder/{category}/{value}.jpg`, this script
 * crafts a focused prompt that *isolates* that single attribute and saves
 * the rendered JPG to `public/builder/{category}/{value}.jpg`. Once those
 * files exist, `OptionImageCard` renders them automatically (the gradient +
 * emoji is only the fallback for missing files).
 *
 * Usage:
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --category=hair-color
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --category=breast-size --value=huge --force
 *   pnpm tsx --env-file-if-exists=.env.local scripts/generate-builder-option-images.ts --confirm --concurrency=4
 *
 * Default is DRY-RUN: prints the plan + estimated cost, makes no fal calls.
 * Pass --confirm to actually fire. --force regenerates files that already exist.
 *
 * Env required when --confirm: FAL_KEY.
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
  HIP_SHAPES,
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  FEATURES,
  ARCHETYPES,
  MEET_SCENARIOS,
  RELATIONSHIP_STAGES,
  type BuilderOption,
} from '../src/features/builder/options'

const FAL_ENDPOINT_FAST_SDXL = 'fal-ai/fast-sdxl'
const COST_PER_IMAGE_USD = 0.025
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 180_000

// Heavy weights on age markers because SDXL biases young when prompted with
// "beautiful". Mirrors the safety baseline used by the live builder.
const SAFETY_NEGATIVE =
  '(child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5), ' +
  '(school uniform:1.3), (underage:1.5), (minor:1.5), (childlike features:1.5)'

const QUALITY_NEGATIVE =
  'low quality, worst quality, blurry, deformed, bad anatomy, extra limbs, ' +
  'extra fingers, watermark, text, signature, multiple people, ugly, mutated'

const PUBLIC_BUILDER_DIR = path.resolve(process.cwd(), 'public/builder')

// ── CLI ────────────────────────────────────────────────────────────────────

type Args = {
  confirm: boolean
  category: string | null
  value: string | null
  force: boolean
  concurrency: number
}

function parseArgs(): Args {
  const out: Args = { confirm: false, category: null, value: null, force: false, concurrency: 3 }
  for (const a of process.argv.slice(2)) {
    if (a === '--confirm') out.confirm = true
    else if (a === '--force') out.force = true
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
  // Override the global negative when an option needs adversarial pushes
  // (e.g. small breasts → push back against "huge breasts").
  extraNegative?: string
  destPath: string
  // Square crops fine for everything except body-shape / hip-shape / butt-size,
  // which look better as portrait so the body fits.
  imageSize: { width: number; height: number }
}

const PORTRAIT_SIZE = { width: 832, height: 1216 }
const SQUARE_SIZE = { width: 1024, height: 1024 }

// ── Per-category prompt builders ──────────────────────────────────────────

const SUBJECT = '1girl, solo, beautiful adult woman, (mature adult features:1.2)'
const NEUTRAL_BG = 'plain studio background, soft even lighting, neutral pose, looking at camera'
const QUALITY = 'detailed face, sharp focus, 8k uhd, professional photography'

function destFor(category: string, value: string): string {
  return path.join(PUBLIC_BUILDER_DIR, category, `${value}.jpg`)
}

function artStyleJob(o: BuilderOption): Job {
  const style = o.promptFragment ?? 'photorealistic, high detail'
  return {
    category: 'art-style',
    value: o.value,
    prompt: `${style}, ${SUBJECT}, head and shoulders portrait, white blouse, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('art-style', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function ethnicityJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} features`
  return {
    category: 'ethnicity',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${fragment}:1.4), head and shoulders, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('ethnicity', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function ageJob(o: typeof AGE_RANGES[number]): Job {
  return {
    category: 'age',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${o.defaultAge} year old:1.4), head and shoulders, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('age', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function skinToneJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} skin`
  return {
    category: 'skin-tone',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${fragment}:1.5), shoulders and neck visible, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('skin-tone', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function bodyTypeJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} build`
  return {
    category: 'body-type',
    value: o.value,
    prompt: `photorealistic full body shot, ${SUBJECT}, (${fragment}:1.4), white tank top and shorts, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('body-type', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function breastSizeJob(o: BuilderOption): Job {
  // Size-specific weights — match the live builder logic so the option preview
  // looks like what the user will actually get.
  const map: Record<string, { positive: string; negative: string }> = {
    small: {
      positive: '(small breasts:1.4), petite bust, modest chest',
      negative: '(huge breasts:1.4), (large breasts:1.3), busty',
    },
    medium: {
      positive: '(medium breasts:1.3), balanced chest, B cup',
      negative: '(huge breasts:1.3), (very small breasts:1.2), (flat chest:1.3)',
    },
    large: {
      positive: '(large breasts:1.5), full chest, busty, D cup',
      negative: '(small breasts:1.3), (flat chest:1.4), (medium breasts:1.2)',
    },
    huge: {
      positive: '(huge breasts:1.6), (very large breasts:1.4), busty figure, DD cup',
      negative: '(small breasts:1.4), (flat chest:1.5), (medium breasts:1.3)',
    },
  }
  const entry = map[o.value]!
  return {
    category: 'breast-size',
    value: o.value,
    prompt: `photorealistic cowboy shot, ${SUBJECT}, average build, ${entry.positive}, white tank top, ${NEUTRAL_BG}, ${QUALITY}`,
    extraNegative: entry.negative,
    destPath: destFor('breast-size', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function buttSizeJob(o: BuilderOption): Job {
  const map: Record<string, { positive: string; negative: string }> = {
    small: {
      positive: '(slim hips:1.3), (small butt:1.2), narrow waist',
      negative: '(big butt:1.4), (wide hips:1.3), (thick thighs:1.3)',
    },
    medium: {
      positive: '(medium hips:1.3), proportional butt',
      negative: '(huge butt:1.3), (very narrow hips:1.2)',
    },
    large: {
      positive: '(large butt:1.5), (round hips:1.3), curvy hips',
      negative: '(small butt:1.3), (narrow hips:1.3)',
    },
    huge: {
      positive: '(huge butt:1.6), (big bubble butt:1.4), wide round hips, thick thighs',
      negative: '(small butt:1.4), (narrow hips:1.4), (slim figure:1.2)',
    },
  }
  const entry = map[o.value]!
  return {
    category: 'butt-size',
    value: o.value,
    prompt: `photorealistic side view full body shot, ${SUBJECT}, average build, ${entry.positive}, white shorts and tank top, plain studio background, soft lighting, ${QUALITY}`,
    extraNegative: entry.negative,
    destPath: destFor('butt-size', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function hipShapeJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hips`
  return {
    category: 'hip-shape',
    value: o.value,
    prompt: `photorealistic cowboy shot, ${SUBJECT}, (${fragment}:1.4), white tank top and shorts, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('hip-shape', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function hairColorJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-color',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${fragment}:1.5), medium length hair, head and shoulders, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('hair-color', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function hairLengthJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-length',
    value: o.value,
    prompt: `photorealistic cowboy shot, ${SUBJECT}, (${fragment}:1.5), brown hair, white blouse, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('hair-length', o.value),
    imageSize: PORTRAIT_SIZE,
  }
}

function hairStyleJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} hair`
  return {
    category: 'hair-style',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${fragment}:1.4), brown hair, head and shoulders, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('hair-style', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function eyeColorJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? `${o.value} eyes`
  return {
    category: 'eye-color',
    value: o.value,
    prompt: `photorealistic extreme close up of a face, ${SUBJECT}, (${fragment}:1.6), highly detailed eyes, looking at camera, ${QUALITY}`,
    destPath: destFor('eye-color', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function featureJob(o: BuilderOption): Job {
  const fragment = o.promptFragment ?? o.value
  return {
    category: 'features',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, (${fragment}:1.5), head and shoulders, ${NEUTRAL_BG}, ${QUALITY}`,
    destPath: destFor('features', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function archetypeJob(o: BuilderOption): Job {
  // Mood-specific cues — turn the archetype's defining vibe into a visible
  // expression / wardrobe / lighting choice.
  const moodMap: Record<string, string> = {
    sweet_girlfriend:
      'warm gentle smile, cozy sweater, golden hour soft lighting, romantic mood',
    adventurous_spirit:
      'confident grin, outdoor jacket, mountain backdrop, natural daylight, energetic mood',
    mysterious_one:
      'subtle smirk, dark elegant outfit, low-key moody lighting, shadows on face',
    confident_leader:
      'direct gaze, sharp business attire, studio lighting, powerful posture',
    shy_romantic:
      'soft blush, looking down slightly, pastel cardigan, dreamy soft lighting',
    intellectual:
      'thoughtful expression, glasses, library or bookshelf background, warm reading light',
    free_spirit:
      'carefree smile, bohemian outfit, sunlit meadow, golden hour',
    caretaker:
      'warm caring smile, soft pastel sweater, kitchen or home background, soft window light',
    dominant_temptress:
      'confident sultry expression, black leather outfit, dramatic studio lighting, red lipstick',
    playful_brat:
      'playful smirk, tongue out slightly, casual crop top, neon pink lighting, mischievous mood',
  }
  const mood = moodMap[o.value] ?? 'neutral expression, plain studio background, soft lighting'
  return {
    category: 'archetype',
    value: o.value,
    prompt: `photorealistic portrait, ${SUBJECT}, ${mood}, head and shoulders, ${QUALITY}`,
    destPath: destFor('archetype', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function meetScenarioJob(o: BuilderOption): Job {
  const sceneMap: Record<string, string> = {
    coffee_shop: 'beautiful adult woman sitting in a cozy coffee shop, latte on the table, warm interior lighting',
    mutual_friends: 'beautiful adult woman at a friendly house party, casual outfit, warm ambient lighting',
    dating_app: 'beautiful adult woman taking a casual selfie in her bedroom, soft daylight',
    neighbors: 'beautiful adult woman waving from her apartment doorway, warm corridor lighting',
    colleagues: 'beautiful adult woman in modern office attire, glass office background, daylight',
    gym: 'beautiful adult woman in gym wear at a modern gym, soft daylight, fit body',
    club: 'beautiful adult woman in a stylish dress at a nightclub, neon ambient lighting, soft bokeh',
    custom: 'beautiful adult woman with a friendly smile, plain background, soft lighting',
  }
  const scene = sceneMap[o.value] ?? sceneMap.custom!
  return {
    category: 'meet-scenario',
    value: o.value,
    prompt: `photorealistic, ${scene}, looking at camera, mature adult features, ${QUALITY}`,
    destPath: destFor('meet-scenario', o.value),
    imageSize: SQUARE_SIZE,
  }
}

function relationshipStageJob(o: BuilderOption): Job {
  const sceneMap: Record<string, string> = {
    just_met:
      'photorealistic candid moment, beautiful adult woman smiling shyly, casual coffee shop background, daylight, slight blush',
    dating:
      'photorealistic, beautiful adult woman on a casual date, candle-lit restaurant background, warm smile',
    relationship:
      'photorealistic, beautiful adult woman cuddling on a sofa, cozy home background, soft warm light',
    long_term:
      'photorealistic, beautiful adult woman in a comfortable home setting, holding a coffee mug, soft morning light, gentle smile',
  }
  const scene = sceneMap[o.value] ?? sceneMap.just_met!
  return {
    category: 'relationship-stage',
    value: o.value,
    prompt: `${scene}, mature adult features, ${QUALITY}`,
    destPath: destFor('relationship-stage', o.value),
    imageSize: SQUARE_SIZE,
  }
}

// ── Build all jobs ─────────────────────────────────────────────────────────

function buildAllJobs(): Job[] {
  return [
    ...ART_STYLES.map(artStyleJob),
    ...ETHNICITIES.map(ethnicityJob),
    ...AGE_RANGES.map(ageJob),
    ...SKIN_TONES.map(skinToneJob),
    ...BODY_TYPES.map(bodyTypeJob),
    ...BREAST_SIZES.map(breastSizeJob),
    ...BUTT_SIZES.map(buttSizeJob),
    ...HIP_SHAPES.map(hipShapeJob),
    ...HAIR_COLORS.map(hairColorJob),
    ...HAIR_LENGTHS.map(hairLengthJob),
    ...HAIR_STYLES.map(hairStyleJob),
    ...EYE_COLORS.map(eyeColorJob),
    ...FEATURES.map(featureJob),
    ...ARCHETYPES.map(archetypeJob),
    ...MEET_SCENARIOS.map(meetScenarioJob),
    ...RELATIONSHIP_STAGES.map(relationshipStageJob),
  ]
}

// ── fal.ai (inline, no SDK) ───────────────────────────────────────────────

type FalImage = { url: string; width?: number; height?: number; content_type?: string }

async function generateOne(opts: {
  prompt: string
  negativePrompt: string
  imageSize: { width: number; height: number }
  falKey: string
}): Promise<FalImage> {
  const submitRes = await fetch(`https://queue.fal.run/${FAL_ENDPOINT_FAST_SDXL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${opts.falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      negative_prompt: opts.negativePrompt,
      image_size: opts.imageSize,
      num_images: 1,
      num_inference_steps: 30,
      guidance_scale: 6.5,
      enable_safety_checker: false,
      enable_output_safety_checker: false,
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
        images?: FalImage[]
        image?: FalImage
        detail?: string
      }
      if (result.detail) throw new Error(`fal failed: ${result.detail}`)
      const img = result.images?.[0] ?? result.image
      if (!img?.url) throw new Error('fal returned no image')
      return img
    }
    if (s.status === 'FAILED' || s.status === 'ERROR') {
      throw new Error(`fal job ${s.status}`)
    }
  }
  throw new Error(`fal timeout after ${POLL_TIMEOUT_MS}ms`)
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
    if (!args.force && (await fileExists(j.destPath))) {
      // already present
      continue
    }
    filtered.push(j)
  }

  console.log(`\nBuilder option-image generator`)
  console.log(`  total options:   ${jobs.length}`)
  console.log(`  to generate:     ${filtered.length}${args.force ? ' (--force)' : ' (skipping existing)'}`)
  console.log(`  endpoint:        ${FAL_ENDPOINT_FAST_SDXL}`)
  console.log(`  concurrency:     ${args.concurrency}`)
  console.log(`  est. cost:       $${(filtered.length * COST_PER_IMAGE_USD).toFixed(2)}`)
  if (args.category) console.log(`  category filter: ${args.category}`)
  if (args.value) console.log(`  value filter:    ${args.value}`)

  if (filtered.length === 0) {
    console.log(`\nNothing to do.\n`)
    return
  }

  if (!args.confirm) {
    console.log(`\n[DRY RUN] No fal calls. Re-run with --confirm to actually generate.\n`)
    console.log(`First 5 planned jobs:`)
    for (const j of filtered.slice(0, 5)) {
      console.log(`  · ${j.category}/${j.value}.jpg`)
      console.log(`      prompt: ${j.prompt.slice(0, 120)}…`)
    }
    return
  }

  const falKey = requireEnv('FAL_KEY')

  let ok = 0
  let failed = 0
  const startedAt = Date.now()

  await runWithConcurrency(filtered, args.concurrency, async (job, idx) => {
    const tag = `[${idx + 1}/${filtered.length}] ${job.category}/${job.value}`
    try {
      const negative = job.extraNegative
        ? `${QUALITY_NEGATIVE}, ${SAFETY_NEGATIVE}, ${job.extraNegative}`
        : `${QUALITY_NEGATIVE}, ${SAFETY_NEGATIVE}`
      const img = await generateOne({
        prompt: job.prompt,
        negativePrompt: negative,
        imageSize: job.imageSize,
        falKey,
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
