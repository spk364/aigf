// Standalone live check for the (dormant) Novita anime-NSFW fallback.
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/verify-novita.ts
//
// Self-contained: inlines the Novita async API (the src adapter is `server-only`
// and can't be imported into a plain tsx script) and pulls in only the PURE
// prompt builder. Submits a Pony anime-nudity prompt and polls for the image URL
// so you can eyeball whether Novita renders true 2D anime + actual nudity.
// Requires NOVITA_API_KEY (and optionally NOVITA_IMAGE_MODEL).

import { buildCharacterScenePrompt } from '../src/features/chat/scene-prompt'

const NOVITA_BASE = 'https://api.novita.ai/v3'
const DEFAULT_MODEL = 'ponyDiffusionV6XL_v6StartWithThisOne_228616.safetensors'

async function main() {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    console.error('NOVITA_API_KEY is not set — add it to .env.local first.')
    process.exit(1)
  }
  const modelName = process.env.NOVITA_IMAGE_MODEL || DEFAULT_MODEL

  const { prompt, negativePrompt } = buildCharacterScenePrompt({
    appearance: {
      appearancePrompt: 'anime girl, long pink hair, twin tails, blue eyes, large breasts',
    },
    artStyle: 'anime',
    scene: 'lying on a bed, topless, completely nude, bare breasts, bedroom, soft lighting',
    isPony: true,
    shot: 'full_body',
  })

  console.log('MODEL  :', modelName)
  console.log('PROMPT :', prompt, '\n')

  const submitRes = await fetch(`${NOVITA_BASE}/async/txt2img`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extra: { response_image_type: 'jpeg' },
      request: {
        model_name: modelName,
        prompt,
        negative_prompt: negativePrompt,
        width: 832,
        height: 1216,
        image_num: 1,
        steps: 28,
        seed: -1,
        sampler_name: 'DPM++ 2M Karras',
        guidance_scale: 6,
      },
    }),
  })
  if (!submitRes.ok) {
    console.error(`SUBMIT FAILED: HTTP ${submitRes.status}`, (await submitRes.text()).slice(0, 400))
    process.exit(1)
  }
  const { task_id } = (await submitRes.json()) as { task_id?: string }
  if (!task_id) {
    console.error('No task_id in submit response.')
    process.exit(1)
  }
  console.log('Submitted. task_id =', task_id)

  const startedAtMs = Date.now()
  const deadlineMs = startedAtMs + 120_000
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500))
    const res = await fetch(`${NOVITA_BASE}/async/task-result?task_id=${encodeURIComponent(task_id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) {
      console.error(`STATUS HTTP ${res.status}`, (await res.text()).slice(0, 200))
      if (res.status === 401 || res.status === 403 || res.status === 404) process.exit(1)
      continue
    }
    const json = (await res.json()) as {
      task?: { status?: string; reason?: string }
      images?: Array<{ image_url?: string }>
    }
    const status = (json.task?.status ?? '').toUpperCase()
    const elapsed = Math.round((Date.now() - startedAtMs) / 1000)
    if (status === 'TASK_STATUS_FAILED') {
      console.error('FAILED:', json.task?.reason || '(no reason)')
      process.exit(1)
    }
    if (status !== 'TASK_STATUS_SUCCEED') {
      process.stdout.write(`  …${status || 'unknown'} (${elapsed}s)\n`)
      if (Date.now() > deadlineMs) {
        console.error('Timed out after 120s.')
        process.exit(1)
      }
      continue
    }
    console.log(`\nDONE in ${elapsed}s`)
    console.log('IMAGE :', json.images?.[0]?.image_url ?? '(no url)')
    return
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
