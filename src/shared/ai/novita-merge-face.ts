// Pure helpers for Novita's face-swap (merge-face) endpoint — kept out of
// novita.ts (which is `server-only`) so they can be unit-tested.
//
// Why we face-swap at all: an explicit chat photo cannot be generated from the
// character's reference image. WAN image-edit conditions so hard on the
// (clothed) reference that it re-clothes the subject, so the explicit path runs
// pure text-to-image on a Pony/Illustrious checkpoint and the face is re-rolled
// from the appearance text every time — the character stopped looking like
// herself the moment a photo turned NSFW. Swapping the reference face onto the
// finished frame restores identity without touching the nudity.
//
// Contract verified live 2026-08-05:
//   POST https://api.novita.ai/v3/merge-face   (synchronous, ~4.5 s)
//     body: { face_image_file: <base64>, image_file: <base64>,
//             extra: { response_image_type: 'jpeg' } }
//     200 → { task: { task_id, status }, image_file: <base64>, image_type }
//   `face_image_file` supplies the identity; `image_file` is the frame to edit.
//   No NSFW filter fired on an explicit target.
//
// Note this endpoint is absent from Novita's abbreviated docs index
// (/docs/llms.txt) but is live — probed directly rather than trusted from docs.

export const NOVITA_MERGE_FACE_URL = 'https://api.novita.ai/v3/merge-face'

// Documented input ceilings: 2048×2048 and 30 MB per image. We only enforce the
// byte cap (dimensions would need a decode); our buckets top out at 1344 px.
export const NOVITA_MERGE_FACE_MAX_BYTES = 30 * 1024 * 1024

export type MergeFaceBody = {
  face_image_file: string
  image_file: string
  extra: { response_image_type: 'jpeg' }
}

/**
 * @param faceBase64   base64 of the image the identity is taken FROM
 * @param targetBase64 base64 of the frame the face is placed ONTO
 */
export function buildMergeFaceBody(
  faceBase64: string,
  targetBase64: string,
): MergeFaceBody {
  return {
    face_image_file: faceBase64,
    image_file: targetBase64,
    extra: { response_image_type: 'jpeg' },
  }
}

export type MergeFaceParsed = {
  base64: string
  contentType: string
}

/**
 * Validate a merge-face response. Throws with a short, loggable reason on any
 * shape we can't use — callers treat a throw as "keep the un-swapped frame".
 */
export function parseMergeFaceResponse(json: unknown): MergeFaceParsed {
  if (!json || typeof json !== 'object') {
    throw new Error('merge-face: non-object response')
  }
  const body = json as {
    task?: { status?: string; reason?: string }
    image_file?: unknown
    image_type?: unknown
  }

  const status = (body.task?.status ?? '').toUpperCase()
  // The endpoint is synchronous, so anything other than SUCCEED is terminal —
  // there is no task to poll.
  if (status && status !== 'TASK_STATUS_SUCCEED') {
    throw new Error(`merge-face: ${status}${body.task?.reason ? ` (${body.task.reason})` : ''}`)
  }

  const base64 = body.image_file
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('merge-face: response missing image_file')
  }

  const type = typeof body.image_type === 'string' ? body.image_type.toLowerCase() : 'jpeg'
  return {
    base64,
    contentType: type === 'png' ? 'image/png' : type === 'webp' ? 'image/webp' : 'image/jpeg',
  }
}
