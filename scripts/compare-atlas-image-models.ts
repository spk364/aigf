// Compare the Atlas image models with the SAME character + scene + seed, using
// the REAL chat prompt builders, so you can eyeball the two decisions the
// catalogue now encodes: which t2i model should be the default, and whether the
// explicit edit path actually undresses while keeping the face.
// Saves each result to ./atlas-compare/<name>.jpg.
//
//   node node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env.local scripts/compare-atlas-image-models.ts [characterId] [seed]
//
// Part A (text-to-image) runs the spicy-but-clothed and the explicit scene
// through buildCharacterScenePrompt on every candidate t2i model.
// Part B (image-edit) generates one clothed reference, then runs
// buildCharacterEditPrompt against it — clothed and explicit on WAN 2.7, plus
// explicit on WAN 2.6 as the control that shows the old re-clothing behaviour.
//
// Requires ATLAS_API_KEY (+ DATABASE_URL to read a character's appearance;
// falls back to a generic subject if absent).

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — pg resolved by deep pnpm path (no bundled types there); only
// used for the optional appearance lookup.
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'
import { sceneFromPhotoRequest } from '../src/features/chat/photo-options'
import { resolveExplicitScene, isExplicitPhotoScene } from '../src/features/chat/photo-consistency'
import { classifyShot } from '../src/features/chat/shot-framing'
import {
  buildCharacterScenePrompt,
  buildCharacterEditPrompt,
  type SceneAppearance,
} from '../src/features/chat/scene-prompt'
import { resolveImageSize, DEFAULT_IMAGE_SIZE_PRESET_ID } from '../src/shared/ai/image-models'

const ATLAS = 'https://api.atlascloud.ai/api/v1'
const OUT_DIR = 'atlas-compare'

// Candidate text-to-image models, cheapest first. WAN 2.6 is the previous
// default and stays in the run as the quality/permissiveness baseline.
const T2I_MODELS: Array<{ label: string; model: string; usd: number }> = [
  { label: 'z-image-turbo', model: 'z-image/turbo', usd: 0.005 },
  { label: 'z-image-turbo-lora', model: 'z-image/turbo-lora', usd: 0.01 },
  { label: 'wan-2.6-t2i', model: 'alibaba/wan-2.6/text-to-image', usd: 0.021 },
]

// Two requests that bracket the catalogue's NSFW claim: one spicy-but-clothed
// (the old edit path already handled this) and one explicit (the case WAN 2.5 /
// 2.6 image-edit refused to undress for).
const CLOTHED_MESSAGE =
  'Send me a photo of you sitting on the bed in lingerie, warm evening light in the bedroom'
const EXPLICIT_MESSAGE =
  'Send me a photo of you lying on the bed, fully naked, completely nude, in the bedroom'

const { width, height } = resolveImageSize(DEFAULT_IMAGE_SIZE_PRESET_ID)
const SIZE = `${width}*${height}`

async function loadAppearance(characterId: string | undefined): Promise<SceneAppearance> {
  const fallback: SceneAppearance = {
    subjectTokens:
      'beautiful 25 year old woman, slim curvy figure, long brown wavy hair, green eyes, medium breasts, fair skin',
    negativePrompt: 'ugly, deformed, bad anatomy',
  }
  if (!characterId || !process.env.DATABASE_URL) return fallback
  try {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await c.connect()
    const r = await c.query('select appearance from characters where id=$1', [characterId])
    await c.end()
    return (r.rows[0]?.appearance as SceneAppearance) ?? fallback
  } catch {
    return fallback
  }
}

type GenResult = { url?: string; error?: string; secs: number }

// Atlas forwards the body verbatim to a strict Pydantic schema — unknown keys
// 400 with "Extra inputs are not permitted". image-edit takes `images: [url]`
// (plural); text-to-image does not accept that field at all. Mirrors the body
// builder in src/shared/ai/atlas.ts.
async function gen(
  model: string,
  prompt: string,
  seed: number,
  key: string,
  sourceUrl?: string,
): Promise<GenResult> {
  const started = Date.now()
  const body: Record<string, unknown> = { model, prompt, size: SIZE, seed }
  if (sourceUrl) body.images = [sourceUrl]

  const sub = await fetch(`${ATLAS}/model/generateImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!sub.ok) return { error: `submit ${sub.status}: ${(await sub.text()).slice(0, 140)}`, secs: 0 }
  const submitted = (await sub.json()) as { id?: string; data?: { id?: string } }
  const id = submitted.id ?? submitted.data?.id
  if (!id) return { error: 'no prediction id', secs: 0 }

  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = (await (
      await fetch(`${ATLAS}/model/prediction/${id}`, { headers: { Authorization: `Bearer ${key}` } })
    ).json()) as {
      message?: string
      data?: { status?: string; error?: string; outputs?: string[] }
    }
    const p = res.data
    const st = (p?.status ?? '').toLowerCase()
    const secs = Math.round((Date.now() - started) / 1000)
    if (st === 'completed' || st === 'succeeded') return { url: p?.outputs?.[0], secs }
    if (st === 'failed' || st === 'error') {
      return { error: (p?.error || res.message || 'failed').slice(0, 140), secs }
    }
    if (Date.now() - started > 180_000) return { error: 'timeout', secs }
  }
}

async function save(name: string, url: string): Promise<number> {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  writeFileSync(join(OUT_DIR, `${name}.jpg`), buf)
  return buf.length
}

// Rebuild the scene the chat route would derive from a user message, so the
// prompts under test are the ones production actually sends.
function sceneFor(message: string) {
  const userScene = sceneFromPhotoRequest(message)
  const explicit = isExplicitPhotoScene(userScene) || isExplicitPhotoScene(message)
  return {
    explicit,
    shot: classifyShot(userScene),
    scene: resolveExplicitScene({ scene: userScene, message, explicit }),
  }
}

async function main() {
  const key = process.env.ATLAS_API_KEY
  if (!key) {
    console.error('ATLAS_API_KEY is not set — add it to .env.local first.')
    process.exit(1)
  }
  const characterId = process.argv[2]
  const seed = Number(process.argv[3] ?? 777)
  mkdirSync(OUT_DIR, { recursive: true })

  const appearance = await loadAppearance(characterId)
  const clothed = sceneFor(CLOTHED_MESSAGE)
  const nude = sceneFor(EXPLICIT_MESSAGE)
  console.log(`size ${SIZE} · seed ${seed} · character ${characterId ?? '(generic fallback)'}`)
  console.log(`clothed scene : ${clothed.scene}  [explicit=${clothed.explicit}]`)
  console.log(`explicit scene: ${nude.scene}  [explicit=${nude.explicit}]\n`)

  const rows: Array<{ name: string; usd: number; secs: number; status: string }> = []

  // ── Part A — text-to-image candidates ──────────────────────────────────────
  console.log('── A. text-to-image ──')
  for (const variant of [clothed, nude]) {
    const tag = variant.explicit ? 'explicit' : 'clothed'
    // isFlux/isPony false → the clean SDXL/Atlas branch, same as the chat route
    // takes for an Atlas model.
    const { prompt } = buildCharacterScenePrompt({
      appearance,
      artStyle: 'realistic',
      scene: variant.scene,
      isFlux: false,
      isPony: false,
      explicit: variant.explicit,
      shot: variant.shot,
    })
    for (const m of T2I_MODELS) {
      const name = `A-${tag}-${m.label}`
      const r = await gen(m.model, prompt, seed, key)
      const status = r.url ? `saved ${await save(name, r.url)} B` : `FAILED — ${r.error}`
      rows.push({ name, usd: m.usd, secs: r.secs, status })
      console.log(`  ${name.padEnd(34)} ${String(r.secs).padStart(3)}s  ${status}`)
    }
  }

  // ── Part B — the edit chain ────────────────────────────────────────────────
  // One clothed reference stands in for a character's stored reference image;
  // every edit below is conditioned on it, so identity drift is visible by
  // flipping between the files.
  console.log('\n── B. image-edit chain (identity held from one reference) ──')
  const refPrompt = buildCharacterScenePrompt({
    appearance,
    artStyle: 'realistic',
    scene: 'standing in a bedroom, wearing a casual sweater, natural window light',
    isFlux: false,
    isPony: false,
    explicit: false,
    shot: 'full_body',
  }).prompt
  const ref = await gen('z-image/turbo', refPrompt, seed, key)
  if (!ref.url) {
    console.error(`  reference generation failed — ${ref.error}`)
    process.exit(1)
  }
  rows.push({ name: 'B-reference', usd: 0.005, secs: ref.secs, status: `saved ${await save('B-0-reference', ref.url)} B` })
  console.log(`  B-0-reference                      ${String(ref.secs).padStart(3)}s  saved`)

  const edits: Array<{ name: string; model: string; usd: number; explicit: boolean; scene: string }> = [
    // The case the old default already handled — kept so a regression here is visible.
    { name: 'B-1-clothed-wan2.7', model: 'alibaba/wan-2.7/image-edit', usd: 0.03, explicit: false, scene: clothed.scene },
    // The change: explicit through the edit path, identity preserved.
    { name: 'B-2-explicit-wan2.7', model: 'alibaba/wan-2.7/image-edit', usd: 0.03, explicit: true, scene: nude.scene },
    // Control: same prompt, old model — expected to come back still dressed.
    { name: 'B-3-explicit-wan2.6-control', model: 'alibaba/wan-2.6/image-edit', usd: 0.021, explicit: true, scene: nude.scene },
  ]
  for (const e of edits) {
    const { prompt } = buildCharacterEditPrompt({
      scene: e.scene,
      artStyle: 'realistic',
      explicit: e.explicit,
    })
    const r = await gen(e.model, prompt, seed, key, ref.url)
    const status = r.url ? `saved ${await save(e.name, r.url)} B` : `FAILED — ${r.error}`
    rows.push({ name: e.name, usd: e.usd, secs: r.secs, status })
    console.log(`  ${e.name.padEnd(34)} ${String(r.secs).padStart(3)}s  ${status}`)
  }

  const spend = rows.reduce((a, r) => a + (r.status.startsWith('saved') ? r.usd : 0), 0)
  console.log(`\n${rows.length} runs · ~$${spend.toFixed(3)} spent · files in ./${OUT_DIR}/`)
}

void main()
