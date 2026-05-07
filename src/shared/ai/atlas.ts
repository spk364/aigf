import 'server-only'

// Atlas Cloud adapter — NSFW-friendly image and video generation.
//
// Why we need it: fal.ai applies a server-side prompt classifier on its WAN
// video endpoints that rejects explicit terms (`tits`, `naked boobs`, ...)
// even with `enable_safety_checker = false`. Atlas is purpose-built for adult
// content and has no such platform layer — same WAN 2.2 weights, no filter.
//
// API shape:
//   POST https://api.atlascloud.ai/api/v1/model/generateVideo
//        body: { model, image_url, prompt, ...optional }
//        → { id, status, model, created_at }
//   POST https://api.atlascloud.ai/api/v1/model/generateImage
//        body: { model, prompt, ...optional }
//        → { id, status, ... }
//   GET  https://api.atlascloud.ai/api/v1/model/prediction/{id}
//        → { data: { id, status, outputs[], error?, metrics, ... } }
//
// Auth: `Authorization: Bearer ${ATLAS_API_KEY}`
// Status enum: processing | completed | succeeded | failed
//
// Cancel: Atlas does not expose a cancel endpoint as of writing. cancelAtlasJob
// is a no-op stub so the route can call it uniformly.

import type {
  GenerateImageInput,
  GenerateImageResult,
  ImageJobHandles,
  ImageJobStatus,
  GenerateVideoInput,
  GenerateVideoResult,
  VideoJobHandles,
  VideoJobStatus,
} from './fal'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1'

// Atlas's prediction endpoint is fully self-describing — these helper URLs
// are what we hand back to the route so the existing fal-shaped polling code
// keeps working without provider branching.
function predictionUrl(id: string): string {
  return `${ATLAS_BASE}/model/prediction/${id}`
}

function authHeader(): { Authorization: string } {
  const key = process.env.ATLAS_API_KEY
  if (!key) throw new Error('ATLAS_API_KEY is not set')
  return { Authorization: `Bearer ${key}` }
}

// ── Image generation ─────────────────────────────────────────────────────

export async function submitAtlasImageJob(
  input: GenerateImageInput,
): Promise<ImageJobHandles> {
  if (!input.endpoint) throw new Error('Atlas image submit requires an endpoint (model id)')

  const size = (() => {
    if (!input.imageSize) return undefined
    if (typeof input.imageSize === 'string') return undefined
    return `${input.imageSize.width}*${input.imageSize.height}`
  })()

  // Atlas's text-to-image / image-edit endpoints share a single `generateImage`
  // entry point. WAN 2.6 t2i takes prompt + size; image-edit additionally
  // takes image_url. We just send everything we have and let Atlas ignore
  // unknown fields (it returns 422 with `detail` if it doesn't).
  const body: Record<string, unknown> = {
    model: input.endpoint,
    prompt: input.prompt,
    ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    ...(size ? { size } : {}),
    ...(input.numImages !== undefined ? { num_images: input.numImages } : {}),
    ...(input.numInferenceSteps !== undefined
      ? { num_inference_steps: input.numInferenceSteps }
      : {}),
    ...(input.guidanceScale !== undefined ? { guidance_scale: input.guidanceScale } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    // Image-edit / IP-Adapter-style flows — Atlas accepts image_url at root.
    ...(input.ipAdapterImageUrl ? { image_url: input.ipAdapterImageUrl } : {}),
    enable_safety_checker: false,
  }

  const submit = await fetch(`${ATLAS_BASE}/model/generateImage`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const text = await submit.text()
    throw new Error(`atlas image submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const data = (await submit.json()) as {
    id?: string
    data?: { id?: string }
  }
  const id = data.id ?? data.data?.id
  if (!id) {
    throw new Error(
      `atlas image submit response missing id: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  // We synthesize fal-shaped URLs so the polling route can stay provider-
  // agnostic. statusUrl == responseUrl on Atlas — both poll the same endpoint
  // and the response body carries status + outputs.
  const url = predictionUrl(id)
  return {
    requestId: id,
    endpoint: input.endpoint,
    modelName: input.endpoint,
    statusUrl: url,
    responseUrl: url,
    cancelUrl: url,
  }
}

export async function fetchAtlasImageJobStatus(args: {
  statusUrl: string
  responseUrl: string
  requestId: string
  endpoint: string
  modelName: string
  startedAtMs?: number
}): Promise<ImageJobStatus> {
  const res = await fetch(args.statusUrl, { headers: authHeader() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      return {
        status: 'failed',
        error: `atlas authentication failed (HTTP ${res.status}). Check ATLAS_API_KEY.`,
      }
    }
    if (res.status === 404 || res.status === 410) {
      return {
        status: 'failed',
        error: `atlas job ${args.requestId} not found (HTTP ${res.status}).`,
      }
    }
    return {
      status: 'pending',
      phase: 'unknown',
      lastLog: `atlas status HTTP ${res.status}: ${body.slice(0, 200)}`,
      raw: `HTTP_${res.status}`,
    }
  }

  const json = (await res.json()) as {
    data?: {
      id?: string
      status?: string
      outputs?: string[]
      error?: string
      metrics?: { predict_time?: number }
    }
    // Some Atlas endpoints return at root level instead of nested under data.
    id?: string
    status?: string
    outputs?: string[]
    error?: string
  }

  const node = json.data ?? json
  const status = (node.status ?? '').toLowerCase()

  if (status === 'failed' || status === 'error') {
    return {
      status: 'failed',
      error: node.error ?? `atlas job failed (status: ${status})`,
    }
  }

  if (status !== 'completed' && status !== 'succeeded') {
    return {
      status: 'pending',
      phase: status === 'processing' ? 'running' : 'queued',
      raw: status || 'unknown',
    }
  }

  const outputs = node.outputs ?? []
  if (outputs.length === 0) {
    return { status: 'failed', error: 'atlas response had status=completed but empty outputs[]' }
  }

  const result: GenerateImageResult = {
    images: outputs.map((url) => ({
      url,
      width: 0,
      height: 0,
      contentType: 'image/jpeg',
    })),
    seed: 0,
    requestId: args.requestId,
    modelName: args.modelName,
    endpoint: args.endpoint,
    latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
  }
  return { status: 'completed', result }
}

// ── Video generation ─────────────────────────────────────────────────────

export async function submitAtlasVideoJob(
  input: GenerateVideoInput,
): Promise<VideoJobHandles> {
  if (!input.endpoint) throw new Error('Atlas video submit requires an endpoint (model id)')

  const isTurbo = input.endpoint.includes('turbo-spicy')

  // Turbo Spicy is the distilled fast variant — ignore tuning knobs and let
  // the model use its own optimised schedule. Match what we already do for
  // fal's WAN Turbo to avoid 422s on rejected fields.
  const body: Record<string, unknown> = isTurbo
    ? {
        model: input.endpoint,
        image_url: input.imageUrl,
        prompt: input.prompt,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio && input.aspectRatio !== 'auto'
          ? { aspect_ratio: input.aspectRatio }
          : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        enable_safety_checker: false,
      }
    : {
        model: input.endpoint,
        image_url: input.imageUrl,
        prompt: input.prompt,
        ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
        ...(input.numFrames !== undefined ? { num_frames: input.numFrames } : {}),
        ...(input.fps !== undefined ? { frames_per_second: input.fps } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio && input.aspectRatio !== 'auto'
          ? { aspect_ratio: input.aspectRatio }
          : {}),
        ...(input.numInferenceSteps !== undefined
          ? { num_inference_steps: input.numInferenceSteps }
          : {}),
        ...(input.guidanceScale !== undefined ? { guidance_scale: input.guidanceScale } : {}),
        ...(input.shift !== undefined ? { shift: input.shift } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        enable_safety_checker: false,
      }

  const submit = await fetch(`${ATLAS_BASE}/model/generateVideo`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const text = await submit.text()
    throw new Error(`atlas video submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const data = (await submit.json()) as {
    id?: string
    data?: { id?: string }
  }
  const id = data.id ?? data.data?.id
  if (!id) {
    throw new Error(
      `atlas video submit response missing id: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  const url = predictionUrl(id)
  return {
    requestId: id,
    endpoint: input.endpoint,
    statusUrl: url,
    responseUrl: url,
    cancelUrl: url,
  }
}

export async function fetchAtlasVideoJobStatus(args: {
  statusUrl: string
  responseUrl: string
  requestId: string
  endpoint: string
  startedAtMs?: number
}): Promise<VideoJobStatus> {
  const res = await fetch(args.statusUrl, { headers: authHeader() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      return {
        status: 'failed',
        error: `atlas authentication failed (HTTP ${res.status}). Check ATLAS_API_KEY.`,
      }
    }
    if (res.status === 404 || res.status === 410) {
      return {
        status: 'failed',
        error: `atlas job ${args.requestId} not found (HTTP ${res.status}).`,
      }
    }
    return {
      status: 'pending',
      phase: 'unknown',
      lastLog: `atlas status HTTP ${res.status}: ${body.slice(0, 200)}`,
      raw: `HTTP_${res.status}`,
    }
  }

  const json = (await res.json()) as {
    data?: {
      id?: string
      status?: string
      outputs?: string[]
      error?: string
      metrics?: { predict_time?: number }
    }
    id?: string
    status?: string
    outputs?: string[]
    error?: string
  }

  const node = json.data ?? json
  const status = (node.status ?? '').toLowerCase()

  if (status === 'failed' || status === 'error') {
    return {
      status: 'failed',
      error: node.error ?? `atlas job failed (status: ${status})`,
    }
  }

  if (status !== 'completed' && status !== 'succeeded') {
    return {
      status: 'pending',
      phase: status === 'processing' ? 'running' : 'queued',
      raw: status || 'unknown',
    }
  }

  const outputs = node.outputs ?? []
  if (outputs.length === 0) {
    return { status: 'failed', error: 'atlas response had status=completed but empty outputs[]' }
  }

  const result: GenerateVideoResult = {
    video: { url: outputs[0]!, contentType: 'video/mp4' },
    seed: 0,
    requestId: args.requestId,
    endpoint: args.endpoint,
    latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
  }
  return { status: 'completed', result }
}

// Atlas does not expose a cancel endpoint — calling this is a no-op so the
// route can stay provider-agnostic. The fal-side cancel works as expected.
export async function cancelAtlasJob(): Promise<{
  ok: boolean
  status: number
  body: string
}> {
  return { ok: true, status: 200, body: 'atlas cancel is a no-op (provider does not expose cancel)' }
}
