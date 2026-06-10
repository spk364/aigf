// Standalone live check for the fal hard-NSFW path (Pony/Illustrious).
//
//   npm run verify:fal-nsfw            # anime (default)
//   npm run verify:fal-nsfw realistic  # realistic
//
// Submits the exact Pony prompt the chat explicit path builds, through the fal
// adapter, against the configured warm endpoint (FAL_NSFW_ANIME_ENDPOINT /
// FAL_NSFW_REALISTIC_ENDPOINT, or the cold catalogue default). Polls until the
// image URL comes back so you can confirm your warm endpoint (a) renders actual
// nudity and (b) returns fast (warm) rather than cold-starting. Requires FAL_KEY.

import { submitImageJob, fetchImageJobStatus, FAL_ENDPOINT_LORA } from '../src/shared/ai/fal'
import { pickModelIdForStyle, isPonyModelId } from '../src/features/builder/prompt-builder'
import { buildCharacterScenePrompt } from '../src/features/chat/scene-prompt'

async function main() {
  if (!process.env.FAL_KEY) {
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
    console.log('NOTE    : cold fal-ai/lora path — set FAL_NSFW_%s_ENDPOINT to a WARM endpoint for instant results.'.replace('%s', style.toUpperCase()))
  }
  console.log('\nPROMPT  :', prompt, '\n')

  const handles = await submitImageJob({
    prompt,
    negativePrompt,
    imageSize: { width: 832, height: 1216 },
    numImages: 1,
    endpoint,
    modelName,
  })
  console.log('Submitted. requestId =', handles.requestId)

  const startedAtMs = Date.now()
  const deadlineMs = startedAtMs + 240_000
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500))
    const status = await fetchImageJobStatus({
      statusUrl: handles.statusUrl,
      responseUrl: handles.responseUrl,
      requestId: handles.requestId,
      endpoint: handles.endpoint,
      modelName: handles.modelName,
      startedAtMs,
    })
    if (status.status === 'pending') {
      process.stdout.write(`  …${status.phase} (${Math.round((Date.now() - startedAtMs) / 1000)}s)\n`)
      if (Date.now() > deadlineMs) {
        console.error('Timed out after 240s — likely a cold fal-ai/lora start. Deploy a warm endpoint.')
        process.exit(1)
      }
      continue
    }
    if (status.status === 'failed') {
      console.error('FAILED:', status.error)
      process.exit(1)
    }
    console.log(`\nDONE in ${Math.round((Date.now() - startedAtMs) / 1000)}s`)
    console.log('IMAGE :', status.result.images[0]?.url)
    return
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
