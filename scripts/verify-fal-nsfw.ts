// Standalone live check for the fal hard-NSFW path (Pony/Illustrious).
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/verify-fal-nsfw.ts [realistic]
//   (npm run verify:fal-nsfw also works once the tsx bin shim is present)
//
// Self-contained: it inlines the fal queue API (the src/shared/ai/fal.ts adapter
// is `server-only` and can't be imported into a plain tsx script) and only pulls
// in the PURE prompt builders, so it mirrors exactly what chat sends. Submits the
// explicit Pony prompt against the configured warm endpoint (FAL_NSFW_ANIME_ENDPOINT
// / FAL_NSFW_REALISTIC_ENDPOINT, or the cold catalogue default), polls until the
// image URL comes back so you can confirm (a) it renders nudity and (b) it's warm
// (fast) rather than cold-starting. Requires FAL_KEY.

import { pickModelIdForStyle, isPonyModelId } from '../src/features/builder/prompt-builder'
import { buildCharacterScenePrompt } from '../src/features/chat/scene-prompt'

const QUEUE_BASE = 'https://queue.fal.run'
const FAL_ENDPOINT_LORA = 'fal-ai/lora'

async function main() {
  const key = process.env.FAL_KEY
  if (!key) {
    console.error('FAL_KEY is not set — add it to .env.local first.')
    process.exit(1)
  }

  const style = process.argv[2] === 'realistic' ? 'realistic' : 'anime'
  const modelId = pickModelIdForStyle(style, { explicit: true })
  const isPony = isPonyModelId(modelId)

  const appearance =
    style === 'anime'
      ? { appearancePrompt: 'anime girl, long pink hair, twin tails, blue eyes, large breasts' }
      : { subjectTokens: 'caucasian 25 year old woman, long blonde hair, blue eyes, curvy figure' }

  const { prompt, negativePrompt } = buildCharacterScenePrompt({
    appearance,
    artStyle: style,
    scene: 'lying on a bed, topless, completely nude, bare breasts, bedroom, soft lighting',
    isPony,
    shot: 'full_body',
  })

  // Mirror the fal dispatch in image-job.ts: HF repo ids → fal-ai/lora (cold),
  // native `fal-ai/…` endpoints (your warm deployment) → passed through.
  const looksLikeHfRepo = !modelId.startsWith('fal-ai/')
  const endpoint = looksLikeHfRepo ? FAL_ENDPOINT_LORA : modelId
  const modelName = looksLikeHfRepo ? modelId : undefined

  console.log('STYLE   :', style)
  console.log('MODEL   :', modelId, isPony ? '(pony tags on)' : '')
  console.log('ENDPOINT:', endpoint, modelName ? `(model_name=${modelName})` : '(native)')
  if (looksLikeHfRepo) {
    console.log(
      `NOTE    : cold fal-ai/lora path — set FAL_NSFW_${style.toUpperCase()}_ENDPOINT to a WARM endpoint for instant results.`,
    )
  }
  console.log('\nPROMPT  :', prompt, '\n')

  // ── Submit ───────────────────────────────────────────────────────────────
  const body: Record<string, unknown> = {
    prompt,
    image_size: { width: 832, height: 1216 },
    num_images: 1,
    num_inference_steps: 30,
    guidance_scale: 6,
    negative_prompt: negativePrompt,
    enable_safety_checker: false,
    enable_output_safety_checker: false,
    ...(modelName ? { model_name: modelName } : {}),
  }
  const submitRes = await fetch(`${QUEUE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!submitRes.ok) {
    console.error(`SUBMIT FAILED: HTTP ${submitRes.status}`, (await submitRes.text()).slice(0, 400))
    process.exit(1)
  }
  const submit = (await submitRes.json()) as {
    request_id: string
    status_url: string
    response_url: string
  }
  console.log('Submitted. request_id =', submit.request_id)

  // ── Poll ─────────────────────────────────────────────────────────────────
  const startedAtMs = Date.now()
  const deadlineMs = startedAtMs + 240_000
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500))
    const statusUrl = submit.status_url.includes('?')
      ? `${submit.status_url}&logs=1`
      : `${submit.status_url}?logs=1`
    const sres = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } })
    if (!sres.ok) {
      console.error(`STATUS HTTP ${sres.status}`, (await sres.text()).slice(0, 200))
      if (sres.status === 401 || sres.status === 403 || sres.status === 404) process.exit(1)
      continue
    }
    const s = (await sres.json()) as {
      status: string
      logs?: Array<{ message: string }>
    }
    const elapsed = Math.round((Date.now() - startedAtMs) / 1000)
    if (s.status === 'FAILED' || s.status === 'ERROR') {
      console.error('FAILED:', JSON.stringify(s).slice(0, 400))
      process.exit(1)
    }
    if (s.status !== 'COMPLETED') {
      const lastLog = s.logs?.[s.logs.length - 1]?.message ?? ''
      process.stdout.write(`  …${s.status} (${elapsed}s) ${lastLog}\n`)
      if (Date.now() > deadlineMs) {
        console.error('Timed out after 240s — likely a cold fal-ai/lora start. Deploy a warm endpoint.')
        process.exit(1)
      }
      continue
    }
    // COMPLETED → fetch the result body for the image url.
    const rres = await fetch(submit.response_url, { headers: { Authorization: `Key ${key}` } })
    if (!rres.ok) {
      console.error(`RESULT HTTP ${rres.status}`, (await rres.text()).slice(0, 300))
      process.exit(1)
    }
    const result = (await rres.json()) as {
      images?: Array<{ url: string }>
      image?: { url: string }
      has_nsfw_concepts?: boolean[]
    }
    const url = result.images?.[0]?.url ?? result.image?.url
    console.log(`\nDONE in ${elapsed}s`)
    if (result.has_nsfw_concepts) console.log('has_nsfw_concepts:', JSON.stringify(result.has_nsfw_concepts))
    console.log('IMAGE :', url ?? '(no url in result: ' + JSON.stringify(result).slice(0, 200) + ')')
    return
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
