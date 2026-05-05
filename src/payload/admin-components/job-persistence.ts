// Tiny localStorage helper for persisting in-flight fal.ai jobs across page
// reloads. The Payload admin character page submits an image / reference /
// video job to /api/.../generate-* and then polls /api/.../*-status from the
// client every few seconds. If the admin reloads the page mid-generation the
// timer dies, no one drains the fal result, and the asset never gets mirrored
// to R2 — the user reports "сгенерированное видео не сохранилось".
//
// We can't reach for a server-side job table for an MVP fix (would need a new
// collection + cron). localStorage is enough: the next mount of the same
// character page reads the saved job spec and resumes polling. Closed tabs
// are still lost — that requires fal webhooks, deferred.

const STORAGE_PREFIX = 'gfai_admin_job_v1'

export type JobKind = 'image' | 'reference' | 'video'

export type StoredJob = {
  // Match the union shape we send to the *-status routes via URL params.
  requestId: string
  endpoint: string
  modelName?: string
  statusUrl: string
  responseUrl: string
  cancelUrl?: string
  startedAt: number
  promptUsed?: string
  negativePromptUsed?: string
  modelUsed?: string
  setPrimary?: boolean
  // Video-only:
  motionStrength?: string
  mood?: string
  resolutionWarning?: string | null
  sourceImageUrl?: string
}

function key(characterId: string | number, kind: JobKind): string {
  return `${STORAGE_PREFIX}:${kind}:${String(characterId)}`
}

export function saveJob(
  characterId: string | number,
  kind: JobKind,
  job: StoredJob,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key(characterId, kind), JSON.stringify(job))
  } catch {
    // Quota exceeded or storage disabled — best-effort only.
  }
}

export function loadJob(
  characterId: string | number,
  kind: JobKind,
): StoredJob | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key(characterId, kind))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredJob
    // Auto-expire jobs older than 30 minutes — fal keeps results for a while
    // but a job that's been pending half an hour is almost certainly dead.
    if (
      typeof parsed.startedAt === 'number' &&
      Date.now() - parsed.startedAt > 30 * 60 * 1000
    ) {
      clearJob(characterId, kind)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearJob(characterId: string | number, kind: JobKind): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key(characterId, kind))
  } catch {
    // ignore
  }
}
