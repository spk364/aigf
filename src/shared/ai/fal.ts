import 'server-only'

// fal.ai image generation wrapper.
//
// Native fal endpoints (always warm, fast):
//   fal-ai/realistic-vision — RealVisXL, photorealistic portraits (~20-50 s)
//   fal-ai/fast-sdxl        — generic SDXL (~5-10 s)
//   fal-ai/flux/schnell     — FLUX, very fast, 4 steps (~5-10 s)  ← no negative_prompt
//   fal-ai/flux/dev         — FLUX, high quality (~30-60 s)        ← no negative_prompt
//
// HuggingFace checkpoints via fal-ai/lora (cold start 2-3 min):
//   Any string not starting with "fal-ai/" is routed through fal-ai/lora
//   with model_name set to the HF repo ID.
export const FAL_ENDPOINT_REALISTIC_VISION = 'fal-ai/realistic-vision'
export const FAL_ENDPOINT_FAST_SDXL = 'fal-ai/fast-sdxl'
export const FAL_ENDPOINT_LORA = 'fal-ai/lora'
export const FAL_ENDPOINT_FLUX_SCHNELL = 'fal-ai/flux/schnell'
export const FAL_ENDPOINT_FLUX_DEV = 'fal-ai/flux/dev'
export const FAL_ENDPOINT_IP_ADAPTER_FACE_ID = 'fal-ai/ip-adapter-face-id'

// WAN 2.2 (Alibaba) image-to-video. The 14B-A model is the high-quality
// variant; a smaller 5B variant exists but is lower fidelity. Typical
// inference at 720p / 81 frames / 27 steps takes 90-180 s on fal.
export const FAL_ENDPOINT_WAN_V22_I2V = 'fal-ai/wan/v2.2-a14b/image-to-video'

export const FAL_IMAGE_ENDPOINT = FAL_ENDPOINT_REALISTIC_VISION

// Legacy — only relevant when endpoint === FAL_ENDPOINT_LORA.
export const FAL_IMAGE_CHECKPOINT = 'SG161222/RealVisXL_V4.0'

const QUEUE_BASE = 'https://queue.fal.run'

export type ImageSizePreset =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'

// fal.ai accepts either a preset string or an explicit {width, height}.
// Custom objects let us request SDXL-native buckets (e.g. 832×1216 portrait).
export type ImageSize = ImageSizePreset | { width: number; height: number }

export type GenerateImageInput = {
  prompt: string
  negativePrompt?: string
  imageSize?: ImageSize
  numImages?: number
  numInferenceSteps?: number
  guidanceScale?: number
  seed?: number
  // fal.ai endpoint slug. Defaults to FAL_IMAGE_ENDPOINT.
  endpoint?: string
  // HuggingFace checkpoint — only sent when endpoint === fal-ai/lora.
  modelName?: string
  // When set, routes through fal-ai/ip-adapter-face-id for face consistency.
  ipAdapterImageUrl?: string
  ipAdapterScale?: number
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

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 180_000

// FLUX endpoints don't accept negative_prompt and use different step/guidance defaults.
function isFluxEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('fal-ai/flux')
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const endpoint = input.endpoint ?? FAL_IMAGE_ENDPOINT
  const isFlux = isFluxEndpoint(endpoint)
  const isSchnell = endpoint === FAL_ENDPOINT_FLUX_SCHNELL
  const startedAt = Date.now()

  // FLUX: no negative_prompt, fewer steps, different guidance scale.
  // SD/SDXL/LoRA: all standard parameters.
  const defaultSteps = isSchnell ? 4 : isFlux ? 25 : 35
  const defaultGuidance = isFlux ? 3.5 : 5

  // fal expects image_size to be either a string preset or an object {width, height}.
  // Pass through whichever variant the caller chose; default to SDXL-native portrait.
  const imageSizeValue: ImageSize = input.imageSize ?? { width: 832, height: 1216 }

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: imageSizeValue,
    num_images: input.numImages ?? 1,
    num_inference_steps: input.numInferenceSteps ?? defaultSteps,
    guidance_scale: input.guidanceScale ?? defaultGuidance,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  // FLUX ignores negative_prompt — omit it entirely to avoid API errors.
  if (!isFlux && input.negativePrompt) {
    body.negative_prompt = input.negativePrompt
  }

  // model_name is only meaningful for the lora endpoint (HuggingFace checkpoint).
  if (endpoint === FAL_ENDPOINT_LORA && input.modelName) {
    body.model_name = input.modelName
  }

  // IP-Adapter face consistency — pass reference image and scale.
  if (input.ipAdapterImageUrl) {
    body.image_url = input.ipAdapterImageUrl
    body.scale = input.ipAdapterScale ?? 0.7
  }

  // Adult content app — safety checker always off.
  body.enable_safety_checker = false

  const submit = await fetch(`${QUEUE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const text = await submit.text()
    throw new Error(`fal submit failed: ${submit.status} ${text.slice(0, 300)}`)
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
          contentType: img.content_type ?? 'image/jpeg',
        })),
        seed: result.seed,
        requestId: submitData.request_id,
        modelName: endpoint === FAL_ENDPOINT_LORA ? (input.modelName ?? endpoint) : endpoint,
        endpoint,
        latencyMs: Date.now() - startedAt,
      }
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(`fal job ${status.status}: ${JSON.stringify(status)}`)
    }
  }
  throw new Error(`fal job timeout after ${POLL_TIMEOUT_MS}ms (request ${submitData.request_id})`)
}

// ── Image-to-video (WAN 2.2) ────────────────────────────────────────────────

export type VideoResolution = '480p' | '580p' | '720p'
export type VideoAspectRatio = 'auto' | '16:9' | '9:16' | '1:1'

export type GenerateVideoInput = {
  imageUrl: string
  prompt: string
  negativePrompt?: string
  numFrames?: number
  fps?: number
  resolution?: VideoResolution
  aspectRatio?: VideoAspectRatio
  numInferenceSteps?: number
  guidanceScale?: number
  // WAN's `shift` (1.0-10.0). Higher values bias toward less motion / more
  // stable identity preservation. 5 is the default; 4 = more motion freedom.
  shift?: number
  seed?: number
  endpoint?: string
}

export type GeneratedVideo = {
  url: string
  contentType: string
}

export type GenerateVideoResult = {
  video: GeneratedVideo
  seed: number
  requestId: string
  endpoint: string
  latencyMs: number
}

// Video generation can take 90-180s — too long to hold a serverless request
// open. We expose async primitives instead: submit returns the queued request
// id, and the caller polls for status separately.

export async function submitVideoJob(
  input: GenerateVideoInput,
): Promise<{ requestId: string; endpoint: string }> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const endpoint = input.endpoint ?? FAL_ENDPOINT_WAN_V22_I2V

  const body: Record<string, unknown> = {
    image_url: input.imageUrl,
    prompt: input.prompt,
    num_frames: input.numFrames ?? 81,
    frames_per_second: input.fps ?? 16,
    resolution: input.resolution ?? '720p',
    aspect_ratio: input.aspectRatio ?? 'auto',
    num_inference_steps: input.numInferenceSteps ?? 27,
    guidance_scale: input.guidanceScale ?? 3.5,
    shift: input.shift ?? 5,
    ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  // Adult content app — safety checker always off.
  body.enable_safety_checker = false
  body.enable_output_safety_checker = false

  const submit = await fetch(`${QUEUE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const text = await submit.text()
    throw new Error(`fal video submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const submitData = (await submit.json()) as {
    request_id: string
    status_url?: string
    response_url?: string
  }

  return { requestId: submitData.request_id, endpoint }
}

// Cancels a queued or in-progress fal job. fal accepts the cancel request
// for IN_QUEUE jobs reliably; for IN_PROGRESS the model decides whether to
// honour it (most do — WAN 2.2 included).
export async function cancelFalJob(
  endpoint: string,
  requestId: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')
  const res = await fetch(`${QUEUE_BASE}/${endpoint}/requests/${requestId}/cancel`, {
    method: 'PUT',
    headers: { Authorization: `Key ${key}` },
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) }
}

// Mirrors fal.ai's queue status enum so the UI can show "queued vs running".
export type VideoJobPhase = 'queued' | 'running' | 'unknown'

export type VideoJobStatus =
  | {
      status: 'pending'
      phase: VideoJobPhase
      queuePosition?: number
      // Last fal log message (when ?logs=1 is requested), useful for debugging.
      lastLog?: string
      // Raw fal status string (IN_QUEUE / IN_PROGRESS / etc.) for diagnostics.
      raw?: string
    }
  | { status: 'completed'; result: GenerateVideoResult }
  | { status: 'failed'; error: string }

function mapPhase(raw: string | undefined): VideoJobPhase {
  if (!raw) return 'unknown'
  if (raw === 'IN_QUEUE') return 'queued'
  if (raw === 'IN_PROGRESS') return 'running'
  return 'unknown'
}

export async function fetchVideoJobStatus(
  endpoint: string,
  requestId: string,
  startedAtMs?: number,
): Promise<VideoJobStatus> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  // Ask fal to include logs so we can surface the last progress line.
  const statusRes = await fetch(
    `${QUEUE_BASE}/${endpoint}/requests/${requestId}/status?logs=1`,
    { headers: { Authorization: `Key ${key}` } },
  )
  if (!statusRes.ok) {
    // Surface why the status fetch failed instead of silently looking pending.
    // 401/403 = bad key, 404 = job evicted/unknown, 5xx = fal flake.
    const body = await statusRes.text().catch(() => '')
    const summary = `fal status HTTP ${statusRes.status}${body ? `: ${body.slice(0, 200)}` : ''}`
    if (statusRes.status === 404 || statusRes.status === 410) {
      return { status: 'failed', error: `Job not found in fal queue (${summary}). The request may have been evicted.` }
    }
    if (statusRes.status === 401 || statusRes.status === 403) {
      return { status: 'failed', error: `fal authentication failed (${summary}). Check FAL_KEY.` }
    }
    return { status: 'pending', phase: 'unknown', lastLog: summary, raw: `HTTP_${statusRes.status}` }
  }
  const status = (await statusRes.json()) as {
    status: string
    queue_position?: number
    logs?: Array<{ message: string; timestamp?: string }>
  }
  if (status.status === 'FAILED' || status.status === 'ERROR') {
    return { status: 'failed', error: JSON.stringify(status) }
  }
  if (status.status !== 'COMPLETED') {
    const lastLog = Array.isArray(status.logs) && status.logs.length > 0
      ? status.logs[status.logs.length - 1]?.message
      : undefined
    return {
      status: 'pending',
      phase: mapPhase(status.status),
      queuePosition: status.queue_position,
      lastLog,
      raw: status.status,
    }
  }

  const resultRes = await fetch(`${QUEUE_BASE}/${endpoint}/requests/${requestId}`, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!resultRes.ok) {
    return { status: 'failed', error: `fal result fetch failed: ${resultRes.status}` }
  }
  const result = (await resultRes.json()) as {
    video?: { url: string; content_type?: string }
    seed?: number
    detail?: string
  }
  if (result.detail) return { status: 'failed', error: result.detail }
  if (!result.video?.url) {
    return { status: 'failed', error: 'fal video response missing video.url' }
  }

  return {
    status: 'completed',
    result: {
      video: {
        url: result.video.url,
        contentType: result.video.content_type ?? 'video/mp4',
      },
      seed: result.seed ?? 0,
      requestId,
      endpoint,
      latencyMs: startedAtMs ? Date.now() - startedAtMs : 0,
    },
  }
}
