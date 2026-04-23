import 'server-only'

// fal.ai's RealVisXL is served through the generic LoRA SDXL endpoint with
// the Hugging Face checkpoint passed as `model_name`.
// The dedicated `fal-ai/realistic-vision` endpoint exists but does not actually
// schedule jobs (queues forever), so we go through `fal-ai/lora`.
export const FAL_IMAGE_ENDPOINT = 'fal-ai/lora'
export const FAL_IMAGE_CHECKPOINT = 'SG161222/RealVisXL_V4.0'

const QUEUE_BASE = 'https://queue.fal.run'

export type ImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'

export type GenerateImageInput = {
  prompt: string
  negativePrompt?: string
  imageSize?: ImageSize
  numImages?: number
  numInferenceSteps?: number
  guidanceScale?: number
  seed?: number
  modelName?: string
}

export type GeneratedImage = {
  url: string
  width: number
  height: number
  contentType: string
}

export type GenerateImageResult = {
  images: GeneratedImage[]
  seed: number
  requestId: string
  modelName: string
  endpoint: string
  latencyMs: number
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 60_000

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const modelName = input.modelName ?? FAL_IMAGE_CHECKPOINT
  const startedAt = Date.now()

  const submit = await fetch(`${QUEUE_BASE}/${FAL_IMAGE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: modelName,
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      image_size: input.imageSize ?? 'portrait_4_3',
      num_images: input.numImages ?? 1,
      num_inference_steps: input.numInferenceSteps ?? 28,
      guidance_scale: input.guidanceScale ?? 5,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    }),
  })

  if (!submit.ok) {
    const body = await submit.text()
    throw new Error(`fal submit failed: ${submit.status} ${body.slice(0, 200)}`)
  }

  const submitData = (await submit.json()) as {
    request_id: string
    status_url: string
    response_url: string
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const statusRes = await fetch(submitData.status_url, {
      headers: { Authorization: `Key ${key}` },
    })
    if (!statusRes.ok) continue
    const status = (await statusRes.json()) as { status: string }
    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(submitData.response_url, {
        headers: { Authorization: `Key ${key}` },
      })
      const result = (await resultRes.json()) as {
        images: Array<{ url: string; width: number; height: number; content_type: string }>
        seed: number
        detail?: string
      }
      if (result.detail) throw new Error(`fal generation error: ${result.detail}`)
      return {
        images: result.images.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
          contentType: img.content_type,
        })),
        seed: result.seed,
        requestId: submitData.request_id,
        modelName,
        endpoint: FAL_IMAGE_ENDPOINT,
        latencyMs: Date.now() - startedAt,
      }
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`fal job ${status.status}: ${JSON.stringify(status)}`)
    }
  }
  throw new Error(`fal job timeout after ${POLL_TIMEOUT_MS}ms (request ${submitData.request_id})`)
}
