import 'server-only'
import sharp from 'sharp'

export type ImageAnalysis = {
  sizeBytes: number
  width: number
  height: number
  // 0..255 — mean of per-channel means. Pure black / safety-filtered frames
  // come out at 0..2; valid SDXL outputs sit in the 60–180 range even on
  // very dark scenes.
  meanLuminance: number
  // 0..255 — overall standard deviation across all channels. Uniform frames
  // (black, white, solid colour) have stdev near 0; real photos sit ~30+.
  stdDev: number
}

const FETCH_TIMEOUT_MS = 30_000

export async function fetchAndAnalyzeImage(url: string): Promise<ImageAnalysis> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let buffer: Buffer
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
    }
    const arr = await res.arrayBuffer()
    buffer = Buffer.from(arr)
  } finally {
    clearTimeout(timer)
  }

  const stats = await sharp(buffer).stats()
  const channels = stats.channels.slice(0, 3) // ignore alpha if present
  const mean =
    channels.reduce((acc, c) => acc + c.mean, 0) / Math.max(channels.length, 1)
  const stdev =
    channels.reduce((acc, c) => acc + c.stdev, 0) / Math.max(channels.length, 1)

  const meta = await sharp(buffer).metadata()

  return {
    sizeBytes: buffer.byteLength,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    meanLuminance: mean,
    stdDev: stdev,
  }
}

export type FilterDetection =
  | { kind: 'ok' }
  | { kind: 'filtered'; reason: string; analysis: ImageAnalysis }

// fal's safety pipeline replaces flagged outputs with a uniform black frame
// even when `enable_safety_checker: false` is set on certain endpoints
// (realistic-vision is the worst offender). Detect them by:
//   - mean luminance < 5/255  (true black frames sit at 0)
//   - or stddev < 2 across all channels (uniform colour blanket)
// Real images, even very dark gothic portraits, comfortably clear both bars.
export function detectSafetyFilteredFrame(analysis: ImageAnalysis): FilterDetection {
  if (analysis.meanLuminance < 5 && analysis.stdDev < 2) {
    return {
      kind: 'filtered',
      reason: `fal returned a uniform black frame (mean luminance ${analysis.meanLuminance.toFixed(1)}/255, stddev ${analysis.stdDev.toFixed(1)}). This is fal's NSFW safety filter — the prompt or reference image triggered it despite enable_safety_checker:false. Try a different model (FLUX/Pony) or soften the prompt.`,
      analysis,
    }
  }
  if (analysis.stdDev < 2) {
    return {
      kind: 'filtered',
      reason: `fal returned a uniform-colour frame (stddev ${analysis.stdDev.toFixed(1)}). Likely degenerate output (NaN latents) — retry with a different seed or fewer prompt weights.`,
      analysis,
    }
  }
  return { kind: 'ok' }
}
