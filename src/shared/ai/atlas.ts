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

  // Atlas wraps all per-model parameters under `input`. The schema is strict
  // (additional properties forbidden) — sending unknown keys returns 400 with
  // "Extra inputs are not permitted". Spicy/uncensored variants don't accept
  // enable_safety_checker at all (no safety gate by design), so we omit it.
  const isImageEdit = input.endpoint.includes('image-edit')
  const inner: Record<string, unknown> = {
    prompt: input.prompt,
    ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    ...(size ? { size } : {}),
    ...(input.numInferenceSteps !== undefined
      ? { num_inference_steps: input.numInferenceSteps }
      : {}),
    ...(input.guidanceScale !== undefined ? { guidance_scale: input.guidanceScale } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    // image-edit endpoints take a source image; t2i does not.
    ...(isImageEdit && input.ipAdapterImageUrl
      ? { image_url: input.ipAdapterImageUrl }
      : {}),
  }
  const body: Record<string, unknown> = {
    model: input.endpoint,
    input: inner,
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
    // Atlas wraps worker-level 4xx validation errors in a 500 of the form
    //   {"code":500,"message":"unexpected http status code: 400, body: {...}"}
    // Those are terminal — the input was rejected, polling won't recover.
    // Look at the message body and fail fast so the admin sees the reason.
    const looksLikeUpstream4xx =
      /unexpected http status code:\s*4\d\d/i.test(body) ||
      /Invalid request parameters/i.test(body)
    if (looksLikeUpstream4xx) {
      return {
        status: 'failed',
        error: `atlas worker rejected input (HTTP ${res.status}): ${body.slice(0, 600)}`,
      }
    }
    return {
      status: 'pending',
      phase: 'unknown',
      lastLog: `atlas status HTTP ${res.status}: ${body.slice(0, 600)}`,
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

  // Atlas wraps all per-model parameters under `input`. The schema is strict
  // (additional properties forbidden) — sending unknown keys returns 400 with
  // "Extra inputs are not permitted". Spicy/uncensored variants don't accept
  // enable_safety_checker at all (no safety gate by design), so we omit it.
  //
  // Turbo Spicy is the distilled fast variant — ignore tuning knobs and let
  // the model use its own optimised schedule. Mirrors what we do for fal's
  // WAN Turbo. Full Spicy accepts the WAN tuning surface but the fields are
  // still nested under `input`.
  const inner: Record<string, unknown> = isTurbo
    ? {
        image_url: input.imageUrl,
        prompt: input.prompt,
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio && input.aspectRatio !== 'auto'
          ? { aspect_ratio: input.aspectRatio }
          : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      }
    : {
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
      }
  const body: Record<string, unknown> = {
    model: input.endpoint,
    input: inner,
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
    // Atlas wraps worker-level 4xx validation errors in a 500 of the form
    //   {"code":500,"message":"unexpected http status code: 400, body: {...}"}
    // Those are terminal — the input was rejected, polling won't recover.
    // Look at the message body and fail fast so the admin sees the reason.
    const looksLikeUpstream4xx =
      /unexpected http status code:\s*4\d\d/i.test(body) ||
      /Invalid request parameters/i.test(body)
    if (looksLikeUpstream4xx) {
      return {
        status: 'failed',
        error: `atlas worker rejected input (HTTP ${res.status}): ${body.slice(0, 600)}`,
      }
    }
    return {
      status: 'pending',
      phase: 'unknown',
      lastLog: `atlas status HTTP ${res.status}: ${body.slice(0, 600)}`,
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
