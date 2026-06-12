// Compare flat-2D anime NSFW checkpoints on Novita with the SAME prompt + seed,
// so you can pick the best anime checkpoint. Saves each to ./novita-compare-anime/.
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/compare-anime-models.ts [seed]
//   node node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env.local scripts/compare-anime-models.ts
//
// Builds the anime chat prompt (NON-Pony — flat 2D cel-shaded branch, no score
// tags, which SD1.5 anime models don't use) from a generic anime appearance + a
// reclining-nude request, then runs every model below at the same seed.
// Requires NOVITA_API_KEY.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sceneFromPhotoRequest } from '../src/features/chat/photo-options'
import { resolveExplicitScene, isExplicitPhotoScene } from '../src/features/chat/photo-consistency'
import { classifyShot } from '../src/features/chat/shot-framing'
import { buildCharacterScenePrompt } from '../src/features/chat/scene-prompt'
import { capPrompt } from '../src/shared/ai/novita-prompt'

// Flat-2D anime NSFW checkpoints on Novita (all SD1.5). Pony V6 XL is the current
// (2.5D / semi-realistic) default, included for reference.
const MODELS: Array<{ label: string; sd_name: string; sdxl?: boolean }> = [
  { label: 'MeinaHentai-v4', sd_name: 'meinahentai_v4_70340.safetensors' },
  { label: 'Hassaku-v13', sd_name: 'hassakuHentaiModel_v13_75289.safetensors' },
  { label: 'RevAnimated-v122', sd_name: 'revAnimated_v122.safetensors' },
  { label: 'MeinaUnreal-v41', sd_name: 'meinaunreal_v41_80034.safetensors' },
  { label: 'PonyV6XL-current', sd_name: 'ponyDiffusionV6XL_v6StartWithThisOne_228616.safetensors', sdxl: true },
]

// SD1.5-native landscape avoids the duplicate-limb artifact; SDXL (Pony) uses 832x1216.
const SD15 = { width: 768, height: 512 }
const SDXL = { width: 1216, height: 832 }

const ANATOMY_NEGATIVE =
  '(extra arms:1.4), (extra legs:1.4), (extra hands:1.4), (extra limbs:1.4), ' +
  '(missing limbs:1.3), (fused limbs:1.3), (mutated hands:1.3), (malformed limbs:1.3), ' +
  '(too many fingers:1.3), (duplicate:1.3), (conjoined:1.3), (2girls:1.3), (multiple girls:1.3), ' +
  'bad anatomy, deformed, text, watermark, signature'

const MESSAGE =
  'Send me a photo of you lying on the bed, relaxed, in the bedroom, fully naked, legs wide spread'
const NOVITA = 'https://api.novita.ai/v3'

async function gen(
  m: { sd_name: string; sdxl?: boolean },
  prompt: string,
  neg: string,
  seed: number,
  key: string,
): Promise<{ url?: string; error?: string; secs: number }> {
  const started = Date.now()
  const size = m.sdxl ? SDXL : SD15
  const sub = await fetch(`${NOVITA}/async/txt2img`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extra: { response_image_type: 'jpeg' },
      request: {
        model_name: m.sd_name,
        prompt: capPrompt(prompt),
        negative_prompt: capPrompt(neg),
        width: size.width,
        height: size.height,
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
  const seed = Number(process.argv[2] ?? 777)

  const appearance = {
    appearancePrompt:
      'anime style, masterpiece, best quality, anime girl, long pink hair, twin tails, blue eyes, large breasts, slim body',
  }
  const userScene = sceneFromPhotoRequest(MESSAGE)
  const explicit = isExplicitPhotoScene(userScene) || isExplicitPhotoScene(MESSAGE)
  const shot = classifyShot(userScene)
  const scene = resolveExplicitScene({ scene: userScene, message: MESSAGE, explicit })
  // isPony:false → flat 2D anime branch (cel-shaded tokens, no Pony score tags
  // that SD1.5 anime models don't understand).
  const { prompt, negativePrompt } = buildCharacterScenePrompt({
    appearance,
    artStyle: 'anime',
    scene,
    isFlux: false,
    isPony: false,
    shot,
  })
  const fullNegative = `${ANATOMY_NEGATIVE}, ${negativePrompt}`

  const outDir = join(process.cwd(), 'novita-compare-anime')
  mkdirSync(outDir, { recursive: true })
  console.log(`seed: ${seed}\nprompt: ${prompt.slice(0, 160)}…\nsaving to: ${outDir}\n`)

  for (const m of MODELS) {
    const res = await gen(m, prompt, fullNegative, seed, key)
    if (res.url) {
      const buf = Buffer.from(await (await fetch(res.url)).arrayBuffer())
      const file = join(outDir, `${m.label}.jpg`)
      writeFileSync(file, buf)
      console.log(`✓ ${m.label.padEnd(20)} ${res.secs}s  → ${file}`)
    } else {
      console.log(`✗ ${m.label.padEnd(20)} ${res.error}`)
    }
  }
  console.log(`\nDone. Open ${outDir} to compare.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
