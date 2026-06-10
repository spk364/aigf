// Standalone live check for the Novita anime-NSFW path.
//
//   npm exec tsx --env-file-if-exists=.env.local scripts/verify-novita.ts
//   (or: npx tsx --env-file-if-exists=.env.local scripts/verify-novita.ts)
//
// Submits a Pony V6 XL anime-nudity prompt through the real adapter and polls
// until the image URL comes back, so you can eyeball whether Novita renders
// (a) true 2D anime and (b) actual nudity — before trusting it in chat.
// Requires NOVITA_API_KEY (and optionally NOVITA_IMAGE_MODEL) in the env.

import { submitNovitaImageJob, fetchNovitaImageJobStatus } from '../src/shared/ai/novita'
import { buildCharacterScenePrompt } from '../src/features/chat/scene-prompt'

async function main() {
  if (!process.env.NOVITA_API_KEY) {
    console.error('NOVITA_API_KEY is not set — add it to .env.local first.')
    process.exit(1)
  }

  // Build the exact prompt the chat anime+explicit path produces.
  const { prompt, negativePrompt } = buildCharacterScenePrompt({
    appearance: {
      appearancePrompt:
        'anime girl, long pink hair, twin tails, blue eyes, slim figure, large breasts',
    },
    artStyle: 'anime',
    scene: 'lying on a bed, topless, bare breasts, completely nude, bedroom, soft lighting',
    isPony: true,
    shot: 'full_body',
  })

  console.log('MODEL  :', process.env.NOVITA_IMAGE_MODEL || 'novita/pony-v6-xl (default)')
  console.log('PROMPT :', prompt, '\n')
  console.log('NEG    :', negativePrompt, '\n')

  const handles = await submitNovitaImageJob({
    prompt,
    negativePrompt,
    imageSize: { width: 832, height: 1216 },
    numImages: 1,
    endpoint: 'novita/pony-v6-xl',
  })
  console.log('Submitted. task_id =', handles.requestId)

  const startedAtMs = Date.now()
  const deadlineMs = startedAtMs + 120_000
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500))
    const status = await fetchNovitaImageJobStatus({
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
        console.error('Timed out after 120s.')
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
