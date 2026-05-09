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

// WAN 2.2 (Alibaba) image-to-video — open-weight, NSFW-friendly when
// safety_checker is disabled. We expose three variants:
//
//   …a14b/image-to-video/turbo  — distilled fast variant. Fixed price per
//                                  video ($0.05/$0.075/$0.10 for 480/580/720p).
//                                  ~30-60 s; default for most flows.
//   …a14b/image-to-video        — full 14B base model. Per-second pricing
//                                  ($0.04/$0.06/$0.08), best fidelity, slow
//                                  (90-180 s at 720p / 81 frames / 27 steps).
//   …5b/image-to-video          — smaller 5B model. Cheaper and faster but
//                                  weaker identity preservation; preview-tier.
//
// Avoid WAN 2.5/2.6/2.7 ("Partner" Alibaba endpoints) — they apply
// server-side content moderation and reject NSFW prompts/images.
export const FAL_ENDPOINT_WAN_V22_I2V_TURBO = 'fal-ai/wan/v2.2-a14b/image-to-video/turbo'
export const FAL_ENDPOINT_WAN_V22_I2V = 'fal-ai/wan/v2.2-a14b/image-to-video'
export const FAL_ENDPOINT_WAN_V22_5B_I2V = 'fal-ai/wan/v2.2-5b/image-to-video'

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

export type ImageJobHandles = {
  requestId: string
  endpoint: string
  modelName: string
  // fal-provided URLs from the submit response. Polling self-built URLs against
  // the submission endpoint returns 405; always use what fal handed back.
  statusUrl: string
  responseUrl: string
  cancelUrl: string
}

export type ImageJobStatus =
  | {
      status: 'pending'
      phase: VideoJobPhase
      queuePosition?: number
      lastLog?: string
      raw?: string
    }
  | { status: 'completed'; result: GenerateImageResult }
  | { status: 'failed'; error: string }

export async function submitImageJob(input: GenerateImageInput): Promise<ImageJobHandles> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const endpoint = input.endpoint ?? FAL_IMAGE_ENDPOINT
  const isFlux = isFluxEndpoint(endpoint)
  const isSchnell = endpoint === FAL_ENDPOINT_FLUX_SCHNELL

  const defaultSteps = isSchnell ? 4 : isFlux ? 25 : 35
  const defaultGuidance = isFlux ? 3.5 : 5

  const imageSizeValue: ImageSize = input.imageSize ?? { width: 832, height: 1216 }

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: imageSizeValue,
    num_images: input.numImages ?? 1,
    num_inference_steps: input.numInferenceSteps ?? defaultSteps,
    guidance_scale: input.guidanceScale ?? defaultGuidance,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }

  if (!isFlux && input.negativePrompt) {
    body.negative_prompt = input.negativePrompt
  }
  if (endpoint === FAL_ENDPOINT_LORA && input.modelName) {
    body.model_name = input.modelName
  }
  if (input.ipAdapterImageUrl) {
    // fal-ai/ip-adapter-face-id wants `face_image_url`. Other IP-Adapter
    // variants use `image_url`. Sending the wrong name returns COMPLETED at
    // the queue level but 422 with `body.face_images_data_url required` at
    // the response level — confusing failure mode.
    if (endpoint === FAL_ENDPOINT_IP_ADAPTER_FACE_ID) {
      body.face_image_url = input.ipAdapterImageUrl
    } else {
      body.image_url = input.ipAdapterImageUrl
    }
    body.scale = input.ipAdapterScale ?? 0.7
  }
  body.enable_safety_checker = false
  // Some endpoints honour different aliases for the same flag.
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
    throw new Error(`fal submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const submitData = (await submit.json()) as {
    request_id: string
    status_url?: string
    response_url?: string
    cancel_url?: string
  }

  if (!submitData.request_id || !submitData.status_url || !submitData.response_url) {
    throw new Error(
      `fal submit response missing required URLs: ${JSON.stringify(submitData).slice(0, 300)}`,
    )
  }

  return {
    requestId: submitData.request_id,
    endpoint,
    modelName: endpoint === FAL_ENDPOINT_LORA ? (input.modelName ?? endpoint) : endpoint,
    statusUrl: submitData.status_url,
    responseUrl: submitData.response_url,
    cancelUrl: submitData.cancel_url ?? `${submitData.status_url.replace(/\/status.*$/, '')}/cancel`,
  }
}

export async function fetchImageJobStatus(args: {
  statusUrl: string
  responseUrl: string
  requestId: string
  endpoint: string
  modelName: string
  startedAtMs?: number
}): Promise<ImageJobStatus> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const url = args.statusUrl.includes('?')
    ? `${args.statusUrl}&logs=1`
    : `${args.statusUrl}?logs=1`
  const statusRes = await fetch(url, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!statusRes.ok) {
    const body = await statusRes.text().catch(() => '')
    const summary = `fal status HTTP ${statusRes.status}${body ? `: ${body.slice(0, 200)}` : ''}`
    if (statusRes.status === 404 || statusRes.status === 410) {
      return { status: 'failed', error: `Job not found in fal queue (${summary}).` }
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
      phase: status.status === 'IN_QUEUE' ? 'queued' : status.status === 'IN_PROGRESS' ? 'running' : 'unknown',
      queuePosition: status.queue_position,
      lastLog,
      raw: status.status,
    }
  }

  const resultRes = await fetch(args.responseUrl, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!resultRes.ok) {
    // fal returns 422 with a structured `detail` array describing missing or
    // wrong-type body fields. Surface that text so the admin sees the real
    // reason instead of "fal result fetch failed: 422".
    const errBody = await resultRes.text().catch(() => '')
    let parsed: unknown
    try { parsed = JSON.parse(errBody) } catch { parsed = null }
    const detail = (parsed as { detail?: unknown } | null)?.detail
    let detailMsg = ''
    if (Array.isArray(detail)) {
      detailMsg = detail
        .map((d) => {
          const dd = d as { loc?: unknown[]; msg?: string }
          const loc = Array.isArray(dd.loc) ? dd.loc.join('.') : ''
          return `${loc ? loc + ': ' : ''}${dd.msg ?? ''}`
        })
        .join('; ')
    } else if (typeof detail === 'string') {
      detailMsg = detail
    } else {
      detailMsg = errBody.slice(0, 200)
    }
    return {
      status: 'failed',
      error: `fal result HTTP ${resultRes.status}: ${detailMsg || '(empty body)'}`,
    }
  }
  // fal endpoints don't agree on the shape of their result. RealVisXL,
  // fast-sdxl, FLUX, and most LoRA endpoints return `{ images: [...] }`.
  // ip-adapter-face-id and a few others return a singular `{ image: {...} }`
  // and sometimes nest the actual image inside `output` or `result`. Normalise
  // here instead of forcing each caller to know.
  type FalImage = {
    url: string
    width?: number
    height?: number
    content_type?: string
  }
  const rawResult = (await resultRes.json()) as {
    images?: FalImage[]
    image?: FalImage
    output?: { images?: FalImage[]; image?: FalImage }
    result?: { images?: FalImage[]; image?: FalImage }
    seed?: number
    detail?: string
    error?: string
    has_nsfw_concepts?: boolean[]
  }
  if (rawResult.detail) return { status: 'failed', error: rawResult.detail }
  if (rawResult.error) return { status: 'failed', error: rawResult.error }

  const rawImages: FalImage[] = (() => {
    if (Array.isArray(rawResult.images) && rawResult.images.length > 0) return rawResult.images
    if (rawResult.image?.url) return [rawResult.image]
    if (Array.isArray(rawResult.output?.images) && rawResult.output!.images!.length > 0) {
      return rawResult.output!.images!
    }
    if (rawResult.output?.image?.url) return [rawResult.output.image]
    if (Array.isArray(rawResult.result?.images) && rawResult.result!.images!.length > 0) {
      return rawResult.result!.images!
    }
    if (rawResult.result?.image?.url) return [rawResult.result.image]
    return []
  })()

  // fast-sdxl (and a few other endpoints) ignore `enable_safety_checker:false`
  // and instead return a black PNG at indices where its NSFW classifier fired,
  // alongside `has_nsfw_concepts: [true,...]`. Drop those so callers never
  // persist black previews. The luminance gate in image-analysis.ts is a
  // second line of defence for endpoints that don't surface this flag.
  const nsfwFlags = Array.isArray(rawResult.has_nsfw_concepts)
    ? rawResult.has_nsfw_concepts
    : []
  const images: FalImage[] = nsfwFlags.length === rawImages.length
    ? rawImages.filter((_, i) => !nsfwFlags[i])
    : rawImages

  if (images.length === 0) {
    if (nsfwFlags.length > 0 && nsfwFlags.some(Boolean)) {
      return {
        status: 'failed',
        error:
          'fal NSFW filter blocked every output. Adjust the prompt or switch model.',
      }
    }
    // Surface a snippet of the raw response so the admin can see what fal
    // actually replied — much more debuggable than "missing images[]".
    const snippet = JSON.stringify(rawResult).slice(0, 400)
    return {
      status: 'failed',
      error: `fal image response had no usable image. Raw: ${snippet}`,
    }
  }

  return {
    status: 'completed',
    result: {
      images: images.map((img) => ({
        url: img.url,
        width: img.width ?? 0,
        height: img.height ?? 0,
        contentType: img.content_type ?? 'image/jpeg',
      })),
      seed: rawResult.seed ?? 0,
      requestId: args.requestId,
      modelName: args.modelName,
      endpoint: args.endpoint,
      latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
    },
  }
}

// Sync wrapper used by callers that don't need to dodge a Vercel timeout
// (chat regeneration, dev/test routes, builder onboarding flows). Admin
// character flows submit + poll asynchronously instead.
export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const job = await submitImageJob(input)
  const startedAt = Date.now()
  const deadline = startedAt + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const s = await fetchImageJobStatus({
      statusUrl: job.statusUrl,
      responseUrl: job.responseUrl,
      requestId: job.requestId,
      endpoint: job.endpoint,
      modelName: job.modelName,
      startedAtMs: startedAt,
    })
    if (s.status === 'completed') return s.result
    if (s.status === 'failed') throw new Error(s.error)
  }
  throw new Error(`fal job timeout after ${POLL_TIMEOUT_MS}ms (request ${job.requestId})`)
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

export type VideoJobHandles = {
  requestId: string
  endpoint: string
  // fal returns its own queue URLs in the submit response — they live under
  // a SHORT path (e.g. `/fal-ai/wan/requests/<id>/status`) that does NOT match
  // the submission endpoint (`/fal-ai/wan/v2.2-a14b/image-to-video`). Polling
  // self-built status URLs returns 405; we must use whatever fal hands back.
  statusUrl: string
  responseUrl: string
  cancelUrl: string
}

export async function submitVideoJob(input: GenerateVideoInput): Promise<VideoJobHandles> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const endpoint = input.endpoint ?? FAL_ENDPOINT_WAN_V22_I2V_TURBO
  const isTurbo = endpoint === FAL_ENDPOINT_WAN_V22_I2V_TURBO
  const is5B = endpoint === FAL_ENDPOINT_WAN_V22_5B_I2V

  // 5B doesn't accept 480p — only 580p/720p. Force-upgrade to avoid a 422
  // from fal's input validator with no useful detail.
  const resolution =
    is5B && input.resolution === '480p' ? '580p' : input.resolution ?? '720p'

  // Turbo's distilled schedule rejects num_frames, num_inference_steps,
  // shift, guidance_scale, frames_per_second and negative_prompt. Sending
  // any of those returns 422 from the worker. Keep the body minimal here
  // and let the base/5B branch send the full WAN tuning surface.
  const body: Record<string, unknown> = isTurbo
    ? {
        image_url: input.imageUrl,
        prompt: input.prompt,
        resolution,
        aspect_ratio: input.aspectRatio ?? 'auto',
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      }
    : {
        image_url: input.imageUrl,
        prompt: input.prompt,
        num_frames: input.numFrames ?? 81,
        frames_per_second: input.fps ?? 16,
        resolution,
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
  // Turbo and 5B both expose a built-in prompt-expansion LLM. We've already
  // shaped the prompt server-side; let the model use ours verbatim.
  body.enable_prompt_expansion = false

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
    cancel_url?: string
  }

  if (!submitData.request_id || !submitData.status_url || !submitData.response_url) {
    throw new Error(
      `fal submit response missing required URLs: ${JSON.stringify(submitData).slice(0, 300)}`,
    )
  }

  return {
    requestId: submitData.request_id,
    endpoint,
    statusUrl: submitData.status_url,
    responseUrl: submitData.response_url,
    cancelUrl: submitData.cancel_url ?? `${submitData.status_url.replace(/\/status.*$/, '')}/cancel`,
  }
}

// Cancels a queued or in-progress fal job using fal's own cancel URL. fal
// accepts cancel for IN_QUEUE reliably; for IN_PROGRESS most models honour it.
export async function cancelFalJob(
  cancelUrl: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')
  const res = await fetch(cancelUrl, {
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

export async function fetchVideoJobStatus(args: {
  // fal-provided status URL — under a SHORT path that does NOT match the
  // submission endpoint. Always pass what fal handed back at submit time.
  statusUrl: string
  responseUrl: string
  requestId: string
  endpoint: string
  startedAtMs?: number
}): Promise<VideoJobStatus> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  // Ask fal to include logs so we can surface the last progress line.
  const url = args.statusUrl.includes('?')
    ? `${args.statusUrl}&logs=1`
    : `${args.statusUrl}?logs=1`
  const statusRes = await fetch(url, {
    headers: { Authorization: `Key ${key}` },
  })
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

  const resultRes = await fetch(args.responseUrl, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!resultRes.ok) {
    // fal returns a structured `detail` array on 422 describing exactly which
    // body field the model worker rejected. Surface that instead of a bare
    // status code so admins can fix the request.
    const errBody = await resultRes.text().catch(() => '')
    let parsed: unknown
    try { parsed = JSON.parse(errBody) } catch { parsed = null }
    const detail = (parsed as { detail?: unknown } | null)?.detail
    let detailMsg = ''
    if (Array.isArray(detail)) {
      detailMsg = detail
        .map((d) => {
          const dd = d as { loc?: unknown[]; msg?: string }
          const loc = Array.isArray(dd.loc) ? dd.loc.join('.') : ''
          return `${loc ? loc + ': ' : ''}${dd.msg ?? ''}`
        })
        .join('; ')
    } else if (typeof detail === 'string') {
      detailMsg = detail
    } else {
      detailMsg = errBody.slice(0, 300)
    }
    return {
      status: 'failed',
      error: `fal video result HTTP ${resultRes.status}: ${detailMsg || '(empty body)'}`,
    }
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
      requestId: args.requestId,
      endpoint: args.endpoint,
      latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
    },
  }
}
