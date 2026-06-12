// Compare photorealistic NSFW checkpoints on Novita with the SAME prompt + seed,
// so you can eyeball which renders the best realistic photo. Saves each result to
// ./novita-compare/<model>.jpg.
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/compare-realistic-models.ts [characterId] [seed]
//   node node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env.local scripts/compare-realistic-models.ts 83
//
// Builds the realistic chat prompt (NON-Pony — clean photoreal branch, no score
// tags) from a character's appearance + a fixed reclining-nude request, then runs
// every model below at the same seed. Requires NOVITA_API_KEY (+ DATABASE_URL to
// read the character's appearance; falls back to a generic subject if absent).

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — pg resolved by deep pnpm path (no bundled types there); only
// used for the optional appearance lookup.
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js'
import { sceneFromPhotoRequest } from '../src/features/chat/photo-options'
import { resolveExplicitScene, isExplicitPhotoScene } from '../src/features/chat/photo-consistency'
import { classifyShot } from '../src/features/chat/shot-framing'
import { buildCharacterScenePrompt, type SceneAppearance } from '../src/features/chat/scene-prompt'
import { capPrompt } from '../src/shared/ai/novita-prompt'

// Photoreal NSFW checkpoints available on Novita (sd_name → label). All SD1.5,
// so a landscape size near their native bucket avoids the duplicate-body artifact
// SD1.5 shows at full SDXL resolution.
const MODELS: Array<{ label: string; sd_name: string }> = [
  { label: 'EpicPhotoGasm-xPlusPlus', sd_name: 'epicphotogasm_xPlusPlus_135412.safetensors' },
  { label: 'EpicPhotoGasm-x', sd_name: 'epicphotogasm_x_131265.safetensors' },
  { label: 'PornMasterPro-v5', sd_name: 'pornmasterPro_fullV5-inpainting_135217.safetensors' },
  { label: 'EpicRealism-pureEvoV5', sd_name: 'epicrealism_pureEvolutionV5_97793.safetensors' },
  { label: 'EpicRealism-naturalSin', sd_name: 'epicrealism_naturalSinRC1VAE_106430.safetensors' },
  { label: 'RealisticVision-v51', sd_name: 'realisticVisionV51_v51VAE_94301.safetensors' },
  { label: 'RealisticVision-v40', sd_name: 'realisticVisionV40_v40VAE-inpainting_81543.safetensors' },
  { label: 'MajicMixRealistic-v7', sd_name: 'majicmixRealistic_v7_134792.safetensors' },
]

const WIDTH = 912
const HEIGHT = 624

const MESSAGE =
  'Send me a photo of you lying on the bed, relaxed, in the bedroom, fully naked, legs wide spread'

const NOVITA = 'https://api.novita.ai/v3'

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

async function gen(
  sd_name: string,
  prompt: string,
  neg: string,
  seed: number,
  key: string,
): Promise<{ url?: string; error?: string; secs: number }> {
  const started = Date.now()
  const sub = await fetch(`${NOVITA}/async/txt2img`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extra: { response_image_type: 'jpeg' },
      request: {
        model_name: sd_name,
        prompt: capPrompt(prompt),
        negative_prompt: capPrompt(neg),
        width: WIDTH,
        height: HEIGHT,
        image_num: 1,
        steps: 30,
        seed,
        sampler_name: 'DPM++ 2M Karras',
        guidance_scale: 6,
      },
    }),
  })
  if (!sub.ok) return { error: `submit ${sub.status}: ${(await sub.text()).slice(0, 120)}`, secs: 0 }
  const { task_id } = (await sub.json()) as { task_id?: string }
  if (!task_id) return { error: 'no task_id', secs: 0 }
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const j = (await (
      await fetch(`${NOVITA}/async/task-result?task_id=${task_id}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
    ).json()) as { task?: { status?: string; reason?: string }; images?: Array<{ image_url?: string }> }
    const st = (j.task?.status ?? '').toUpperCase()
    const secs = Math.round((Date.now() - started) / 1000)
    if (st === 'TASK_STATUS_SUCCEED') return { url: j.images?.[0]?.image_url, secs }
    if (st === 'TASK_STATUS_FAILED') return { error: `task failed: ${j.task?.reason ?? ''}`, secs }
    if (Date.now() - started > 120_000) return { error: 'timeout', secs }
  }
}

async function main() {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    console.error('NOVITA_API_KEY is not set — add it to .env.local first.')
    process.exit(1)
  }
  const characterId = process.argv[2]
  const seed = Number(process.argv[3] ?? 777)

  const appearance = await loadAppearance(characterId)
  const userScene = sceneFromPhotoRequest(MESSAGE)
  const explicit = isExplicitPhotoScene(userScene) || isExplicitPhotoScene(MESSAGE)
  const shot = classifyShot(userScene)
  const scene = resolveExplicitScene({ scene: userScene, message: MESSAGE, explicit })
  // isPony:false → clean photoreal branch (no Pony score tags, which SD1.5 photoreal
  // models don't understand).
  const { prompt, negativePrompt } = buildCharacterScenePrompt({
    appearance,
    artStyle: 'realistic',
    scene,
    isFlux: false,
    isPony: false,
    shot,
  })

  const outDir = join(process.cwd(), 'novita-compare')
  mkdirSync(outDir, { recursive: true })

  console.log(`character: ${characterId ?? '(generic subject)'} | seed: ${seed} | size: ${WIDTH}x${HEIGHT}`)
  console.log(`prompt: ${prompt.slice(0, 160)}…\n`)
  console.log(`saving to: ${outDir}\n`)

  for (const m of MODELS) {
    const res = await gen(m.sd_name, prompt, negativePrompt, seed, key)
    if (res.url) {
      const buf = Buffer.from(await (await fetch(res.url)).arrayBuffer())
      const file = join(outDir, `${m.label}.jpg`)
      writeFileSync(file, buf)
      console.log(`✓ ${m.label.padEnd(26)} ${res.secs}s  → ${file}`)
    } else {
      console.log(`✗ ${m.label.padEnd(26)} ${res.error}`)
    }
  }
  console.log(`\nDone. Open the ${outDir} folder to compare.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
