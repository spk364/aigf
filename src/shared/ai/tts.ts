import 'server-only'

// fal.ai text-to-speech wrapper.
//
// Primary endpoint: MiniMax Speech-02 HD ("$0.10 per 1k characters") — broad
// multilingual support including EN/RU/ES, 300+ pre-built voices and
// expressive intonation. Sufficient for character voices in the MVP.
//
// Fallback endpoints can be added by extending TTS_ENDPOINTS. The schema is
// model-specific; only models we explicitly support belong in this catalog.
export const TTS_ENDPOINT_MINIMAX_SPEECH_02_HD = 'fal-ai/minimax/speech-02-hd'
export const TTS_ENDPOINT_MINIMAX_SPEECH_02_TURBO = 'fal-ai/minimax/speech-02-turbo'

export const DEFAULT_TTS_ENDPOINT = TTS_ENDPOINT_MINIMAX_SPEECH_02_HD

const QUEUE_BASE = 'https://queue.fal.run'

// Polling envelope. TTS jobs typically complete in 3-10 s, but cold starts
// or long inputs can stretch to ~30 s. Cap at 90 s to avoid serverless hang.
const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 90_000

export type TTSEndpoint =
  | typeof TTS_ENDPOINT_MINIMAX_SPEECH_02_HD
  | typeof TTS_ENDPOINT_MINIMAX_SPEECH_02_TURBO

export type TTSAudioFormat = 'mp3' | 'wav' | 'flac' | 'pcm'

export type GenerateSpeechInput = {
  text: string
  // MiniMax pre-built voice id (e.g. "Wise_Woman", "Friendly_Person") OR a
  // cloned voice id from the MiniMax voice library.
  voiceId: string
  endpoint?: TTSEndpoint
  // 0.5–2.0; 1.0 = natural pace.
  speed?: number
  // 0–1; 1.0 = default volume.
  volume?: number
  // -12 to +12 semitones.
  pitch?: number
  format?: TTSAudioFormat
  sampleRate?: number
  // 64000 to 320000 bps.
  bitrate?: number
  // 0–7; emotion preset where supported.
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised'
}

export type GenerateSpeechResult = {
  audioUrl: string
  contentType: string
  durationSec?: number
  requestId: string
  endpoint: string
  latencyMs: number
}

// MiniMax voice metadata is returned in the `audio` block — fal sometimes
// includes `duration_seconds`, sometimes doesn't. We surface it when present
// so callers can store it on media-assets, but the field stays optional.
type MinimaxAudio = {
  url: string
  content_type?: string
  file_size?: number
  duration_seconds?: number
}

type MinimaxResultEnvelope = {
  audio?: MinimaxAudio
  // Some MiniMax variants nest under `output`/`result`.
  output?: { audio?: MinimaxAudio }
  result?: { audio?: MinimaxAudio }
  detail?: unknown
  error?: string
}

function pickAudio(raw: MinimaxResultEnvelope): MinimaxAudio | null {
  if (raw.audio?.url) return raw.audio
  if (raw.output?.audio?.url) return raw.output.audio
  if (raw.result?.audio?.url) return raw.result.audio
  return null
}

function buildMinimaxBody(input: GenerateSpeechInput): Record<string, unknown> {
  // MiniMax expects voice_setting + audio_setting nested objects. The text
  // length cap is 5000 chars sync; longer requests should chunk in the caller.
  const voiceSetting: Record<string, unknown> = {
    voice_id: input.voiceId,
    speed: input.speed ?? 1,
    vol: input.volume ?? 1,
    pitch: input.pitch ?? 0,
    english_normalization: true,
  }
  if (input.emotion) {
    voiceSetting.emotion = input.emotion
  }
  const audioSetting: Record<string, unknown> = {
    format: input.format ?? 'mp3',
    sample_rate: input.sampleRate ?? 32000,
    bitrate: input.bitrate ?? 128000,
    channel: 1,
  }
  return {
    text: input.text,
    voice_setting: voiceSetting,
    audio_setting: audioSetting,
    output_format: 'url',
  }
}

export type TTSJobHandles = {
  requestId: string
  endpoint: string
  statusUrl: string
  responseUrl: string
  cancelUrl: string
}

export type TTSJobStatus =
  | { status: 'pending'; raw?: string; lastLog?: string }
  | { status: 'completed'; result: GenerateSpeechResult }
  | { status: 'failed'; error: string }

export async function submitSpeechJob(input: GenerateSpeechInput): Promise<TTSJobHandles> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')

  const endpoint = input.endpoint ?? DEFAULT_TTS_ENDPOINT
  if (input.text.length > 5000) {
    throw new Error(
      `TTS text too long (${input.text.length} chars). Sync MiniMax cap is 5000; chunk before submitting.`,
    )
  }

  const body = buildMinimaxBody(input)

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
    throw new Error(`fal tts submit failed: ${submit.status} ${text.slice(0, 300)}`)
  }

  const submitData = (await submit.json()) as {
    request_id: string
    status_url?: string
    response_url?: string
    cancel_url?: string
  }
  if (!submitData.request_id || !submitData.status_url || !submitData.response_url) {
    throw new Error(
      `fal tts submit response missing required URLs: ${JSON.stringify(submitData).slice(0, 300)}`,
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

export async function fetchSpeechJobStatus(args: {
  statusUrl: string
  responseUrl: string
  requestId: string
  endpoint: string
  startedAtMs?: number
}): Promise<TTSJobStatus> {
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
    const summary = `fal tts status HTTP ${statusRes.status}${body ? `: ${body.slice(0, 200)}` : ''}`
    if (statusRes.status === 404 || statusRes.status === 410) {
      return { status: 'failed', error: `TTS job not found in fal queue (${summary}).` }
    }
    if (statusRes.status === 401 || statusRes.status === 403) {
      return { status: 'failed', error: `fal authentication failed (${summary}). Check FAL_KEY.` }
    }
    return { status: 'pending', raw: `HTTP_${statusRes.status}`, lastLog: summary }
  }

  const status = (await statusRes.json()) as {
    status: string
    queue_position?: number
    logs?: Array<{ message: string }>
  }
  if (status.status === 'FAILED' || status.status === 'ERROR') {
    return { status: 'failed', error: JSON.stringify(status) }
  }
  if (status.status !== 'COMPLETED') {
    const lastLog = Array.isArray(status.logs) && status.logs.length > 0
      ? status.logs[status.logs.length - 1]?.message
      : undefined
    return { status: 'pending', raw: status.status, lastLog }
  }

  const resultRes = await fetch(args.responseUrl, {
    headers: { Authorization: `Key ${key}` },
  })
  if (!resultRes.ok) {
    const errBody = await resultRes.text().catch(() => '')
    return {
      status: 'failed',
      error: `fal tts result HTTP ${resultRes.status}: ${errBody.slice(0, 200) || '(empty body)'}`,
    }
  }

  const raw = (await resultRes.json()) as MinimaxResultEnvelope
  if (raw.error) return { status: 'failed', error: raw.error }
  const audio = pickAudio(raw)
  if (!audio?.url) {
    const snippet = JSON.stringify(raw).slice(0, 400)
    return { status: 'failed', error: `fal tts response had no audio. Raw: ${snippet}` }
  }

  return {
    status: 'completed',
    result: {
      audioUrl: audio.url,
      contentType: audio.content_type ?? 'audio/mpeg',
      durationSec: typeof audio.duration_seconds === 'number' ? audio.duration_seconds : undefined,
      requestId: args.requestId,
      endpoint: args.endpoint,
      latencyMs: args.startedAtMs ? Date.now() - args.startedAtMs : 0,
    },
  }
}

// Sync wrapper — submit + poll. Use for short texts (greetings, single chat
// messages). For long-form batches, prefer submit + poll from the client to
// avoid serverless timeouts.
export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult> {
  const job = await submitSpeechJob(input)
  const startedAt = Date.now()
  const deadline = startedAt + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const s = await fetchSpeechJobStatus({
      statusUrl: job.statusUrl,
      responseUrl: job.responseUrl,
      requestId: job.requestId,
      endpoint: job.endpoint,
      startedAtMs: startedAt,
    })
    if (s.status === 'completed') return s.result
    if (s.status === 'failed') throw new Error(s.error)
  }
  throw new Error(`fal tts job timeout after ${POLL_TIMEOUT_MS}ms (request ${job.requestId})`)
}
