import 'server-only'

// Novita.ai adapter — always-warm, NSFW-permissive SDXL checkpoints.
//
// Why we need it: anime NSFW needs a Pony/Illustrious-class checkpoint (WAN is
// conservative and re-clothes anime nudity; FLUX black-frames it). On fal those
// checkpoints only run via fal-ai/lora, which cold-starts 2-3 min and routinely
// times out — unusable for a chat photo. Novita hosts the same checkpoints
// always-warm behind a simple async API with NSFW detection OFF by default.
//
// API shape (verified against the live docs 2026-06):
//   POST https://api.novita.ai/v3/async/txt2img
//        body: { extra:{response_image_type}, request:{ model_name, prompt,
//               negative_prompt, width, height, image_num, steps, seed,
//               sampler_name, guidance_scale } }
//        → { task_id }
//   GET  https://api.novita.ai/v3/async/task-result?task_id={id}
//        → { task:{ status, reason, progress_percent, eta }, images:[{image_url}] }
//
// Auth: `Authorization: Bearer ${NOVITA_API_KEY}`
// Status enum: TASK_STATUS_QUEUED | TASK_STATUS_PROCESSING | TASK_STATUS_SUCCEED
//              | TASK_STATUS_FAILED
//
// Cancel: Novita exposes no cancel for async tasks — cancelNovitaJob is a no-op
// stub so the route can call it uniformly.

import type {
  GenerateImageInput,
  GenerateImageResult,
  ImageJobHandles,
  ImageJobStatus,
} from './fal'
import { capPrompt } from './novita-prompt'

const NOVITA_BASE = 'https://api.novita.ai/v3'

// Synthetic catalogue ids → Novita checkpoint `model_name` (the dashboard
// "sd_name"). Kept here rather than in the shared image-models catalogue so an
// admin can't pick a Novita id the admin generate-image route doesn't dispatch.
// Override the checkpoint without a code change via NOVITA_IMAGE_MODEL.
// Anime NSFW → Nova Anime XL (Illustrious SDXL): soft, modern, flat 2D anime —
// chosen over Pony V6 XL (which renders 2.5D/semi-realistic with hard outlines).
// SDXL, so it uses the Pony score tags + SDXL resolution.
const NOVITA_ANIME_DEFAULT = 'novaAnimeXL_xlV10_341799.safetensors'
// Realistic NSFW → EpicPhotoGasm (SD1.5 photoreal): true photorealism, unlike
// Pony's painterly look. SD1.5, so it uses NO score tags + SD1.5 resolution.
const NOVITA_REALISTIC_DEFAULT = 'epicphotogasm_x_131265.safetensors'
const NOVITA_MODEL_NAMES: Record<string, string> = {
  'novita/anime': process.env.NOVITA_ANIME_MODEL || process.env.NOVITA_IMAGE_MODEL || NOVITA_ANIME_DEFAULT,
  'novita/realistic': process.env.NOVITA_REALISTIC_MODEL || NOVITA_REALISTIC_DEFAULT,
}

export function isNovitaModelId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('novita/')
}

function resolveNovitaModelName(endpoint?: string): string {
  if (endpoint && NOVITA_MODEL_NAMES[endpoint]) return NOVITA_MODEL_NAMES[endpoint]!
  // Allow passing a raw checkpoint filename straight through.
  if (endpoint && endpoint.endsWith('.safetensors')) return endpoint
  return NOVITA_MODEL_NAMES['novita/anime']!
}

function authHeader(): { Authorization: string } {
  const key = process.env.NOVITA_API_KEY
  if (!key) throw new Error('NOVITA_API_KEY is not set')
  return { Authorization: `Bearer ${key}` }
}

function taskResultUrl(id: string): string {
  return `${NOVITA_BASE}/async/task-result?task_id=${encodeURIComponent(id)}`
}

// SDXL/Pony sampling defaults. Pony V6 XL renders cleanly at ~28 steps,
// guidance ~6, DPM++ 2M Karras. Callers can override via the input.
const DEFAULT_STEPS = 28
const DEFAULT_GUIDANCE = 6
const DEFAULT_SAMPLER = 'DPM++ 2M Karras'

// ── Image generation ─────────────────────────────────────────────────────

export async function submitNovitaImageJob(
  input: GenerateImageInput,
): Promise<ImageJobHandles> {
  const modelName = resolveNovitaModelName(input.endpoint)

  // Novita wants explicit integer width/height. Mirror the SDXL-native portrait
  // bucket the rest of the pipeline uses when nothing specific is requested.
  const { width, height } =
    input.imageSize && typeof input.imageSize === 'object'
      ? input.imageSize
      : { width: 832, height: 1216 }

  const body = {
    extra: { response_image_type: 'jpeg' },
    request: {
      model_name: modelName,
      prompt: capPrompt(input.prompt),
      negative_prompt: capPrompt(input.negativePrompt ?? ''),
      width,
      height,
      image_num: input.numImages ?? 1,
      steps: input.numInferenceSteps ?? DEFAULT_STEPS,
      seed: input.seed ?? -1,
      sampler_name: DEFAULT_SAMPLER,
      guidance_scale: input.guidanceScale ?? DEFAULT_GUIDANCE,
      // NSFW detection defaults to off; never enable it for adult content.
    },
  }

  const submit = await fetch(`${NOVITA_BASE}/async/txt2img`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`novita image submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const data = (await submit.json()) as { task_id?: string }
  const id = data.task_id
  if (!id) {
    throw new Error(
      `novita image submit response missing task_id: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  const url = taskResultUrl(id)
  return {
    requestId: id,
    endpoint: input.endpoint ?? 'novita/anime',
    modelName,
    statusUrl: url,
    responseUrl: url,
    cancelUrl: url,
  }
}

export async function fetchNovitaImageJobStatus(args: {
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
        error: `novita authentication failed (HTTP ${res.status}). Check NOVITA_API_KEY.`,
      }
    }
    if (res.status === 404 || res.status === 410) {
      return {
        status: 'failed',
        error: `novita task ${args.requestId} not found (HTTP ${res.status}).`,
      }
    }
    // Other 4xx/5xx — treat as transient and let the caller's watchdog bound it.
    return {
      status: 'pending',
      phase: 'unknown',
      lastLog: `novita status HTTP ${res.status}: ${body.slice(0, 300)}`,
      raw: `HTTP_${res.status}`,
    }
  }

  const json = (await res.json()) as {
    task?: { status?: string; reason?: string; progress_percent?: number; eta?: number }
    images?: Array<{ image_url?: string }>
  }

  const status = (json.task?.status ?? '').toUpperCase()

  if (status === 'TASK_STATUS_FAILED') {
    return { status: 'failed', error: json.task?.reason || 'novita task failed' }
  }

  if (status !== 'TASK_STATUS_SUCCEED') {
    // QUEUED / PROCESSING / unknown → still running.
    return {
      status: 'pending',
      phase: status === 'TASK_STATUS_PROCESSING' ? 'running' : 'queued',
      raw: status || 'unknown',
    }
  }

  const urls = (json.images ?? []).map((i) => i.image_url).filter((u): u is string => !!u)
  if (urls.length === 0) {
    return { status: 'failed', error: 'novita task SUCCEED but images[] empty' }
  }

  const result: GenerateImageResult = {
    // width/height 0 — persistGeneratedImage derives real dimensions from the
    // downloaded bytes (same as the Atlas adapter).
    images: urls.map((url) => ({ url, width: 0, height: 0, contentType: 'image/jpeg' })),
    seed: 0,
    requestId: args.requestId,
    modelName: args.modelName,
    endpoint: args.endpoint,
    latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
  }
  return { status: 'completed', result }
}

// Novita async tasks can't be cancelled via the API — no-op so the route stays
// provider-agnostic.
export async function cancelNovitaJob(): Promise<{ ok: boolean; status: number; body: string }> {
  return { ok: true, status: 200, body: 'novita cancel is a no-op (provider does not expose cancel)' }
}
