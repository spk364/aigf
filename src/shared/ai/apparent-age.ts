import 'server-only'
import { createLogger } from '@/shared/lib/logger'

// Apparent-age estimator for generated images (spec §3.10 Layer 6).
//
// Uses a fal-hosted, open-weight vision model (LLaVA-NeXT by default — no
// platform safety refusals, so it will actually look at NSFW outputs, unlike
// OpenAI/Gemini/OpenRouter vision which reject them). Endpoint is env-
// configurable (AGE_CLASSIFIER_FAL_ENDPOINT) so a more accurate age model can
// be dropped in later without touching call sites.
//
// Model choice (verified live 2026-05-24): fal-ai/llava-next follows the
// JSON instruction and returns {"apparentAge","minorRisk"} in ~3s. fal-ai/
// moondream2 was rejected — its fal endpoint ignores `prompt` and only captions
// the image (no age answer); moondream2/visual-query answers but over-flags
// (rated an adult woman minorRisk:true → false-positive bans).
//
// Called synchronously via fal.run (VLMs return in 1-4s); no queue/poll needed.
// Returns null when it can't produce a usable answer (no key, network error,
// unparseable output) — the caller decides fail-open vs fail-closed.

const log = createLogger({ scope: 'safety.apparent-age' })

const DEFAULT_ENDPOINT = 'fal-ai/llava-next'
const FAL_RUN_BASE = 'https://fal.run'
const TIMEOUT_MS = 20_000

const PROMPT =
  'You are an age-verification classifier for an adults-only (18+) platform. ' +
  'Look only at the human in this image and estimate their apparent age. ' +
  'If several people are present, report the youngest. ' +
  'Reply with ONLY compact JSON, no prose: ' +
  '{"apparentAge": <integer>, "minorRisk": <true|false>}. ' +
  'minorRisk is true if the person could plausibly be under 18. ' +
  'If there is no person, reply {"apparentAge": 99, "minorRisk": false}.'

export type ApparentAgeEstimate = {
  apparentAge: number | null
  minorRisk: boolean | null
  raw: string
}

// Pull the structured answer out of a free-form VLM reply. Robust to models
// that wrap JSON in prose or markdown fences, and falls back to lexical signals
// ("minor", "child", "teen", a bare age number) when no JSON is present.
export function parseAgeReply(text: string): ApparentAgeEstimate {
  const raw = text.trim()

  const jsonMatch = raw.match(/\{[^{}]*\}/)
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as { apparentAge?: unknown; minorRisk?: unknown }
      const age =
        typeof obj.apparentAge === 'number'
          ? obj.apparentAge
          : typeof obj.apparentAge === 'string' && obj.apparentAge.trim() !== '' && !Number.isNaN(Number(obj.apparentAge))
            ? Number(obj.apparentAge)
            : null
      const minor = typeof obj.minorRisk === 'boolean' ? obj.minorRisk : null
      if (age !== null || minor !== null) return { apparentAge: age, minorRisk: minor, raw }
    } catch {
      // fall through to lexical parsing
    }
  }

  const lower = raw.toLowerCase()
  const lexicalMinor = /\b(minor|child|kid|teen|teenager|underage|under 18|infant|toddler)\b/.test(lower)
  const numMatch = lower.match(/\b(\d{1,2})\b/)
  const age = numMatch ? Number(numMatch[1]) : null
  return { apparentAge: age, minorRisk: lexicalMinor || null, raw }
}

export async function estimateApparentAge(imageUrl: string): Promise<ApparentAgeEstimate | null> {
  const key = process.env.FAL_KEY
  if (!key) {
    log.warn({ msg: 'apparent_age.no_fal_key' })
    return null
  }

  const endpoint = process.env.AGE_CLASSIFIER_FAL_ENDPOINT || DEFAULT_ENDPOINT
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${FAL_RUN_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, prompt: PROMPT }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.warn({ msg: 'apparent_age.http_error', status: res.status, body: body.slice(0, 200) })
      return null
    }
    // moondream returns { output: string }; other VLMs use { text } or
    // { response } / { outputs[].text }. Normalise across the common shapes.
    const data = (await res.json()) as Record<string, unknown>
    const text =
      (typeof data.output === 'string' && data.output) ||
      (typeof data.text === 'string' && data.text) ||
      (typeof data.response === 'string' && data.response) ||
      (Array.isArray(data.outputs) && typeof (data.outputs[0] as { text?: string })?.text === 'string'
        ? (data.outputs[0] as { text: string }).text
        : '')
    if (!text) {
      log.warn({ msg: 'apparent_age.no_text', keys: Object.keys(data).join(',') })
      return null
    }
    return parseAgeReply(text)
  } catch (err) {
    log.warn({ msg: 'apparent_age.request_failed', err: String(err) })
    return null
  } finally {
    clearTimeout(timer)
  }
}
