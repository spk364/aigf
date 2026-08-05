import { describe, it, expect } from 'vitest'
import { buildMergeFaceBody, parseMergeFaceResponse } from './novita-merge-face'

describe('buildMergeFaceBody', () => {
  // Getting these two the wrong way round silently swaps the generated face
  // ONTO the reference — a correct-looking 200 with a useless image.
  it('takes identity from face_image_file and edits image_file', () => {
    expect(buildMergeFaceBody('FACE', 'TARGET')).toEqual({
      face_image_file: 'FACE',
      image_file: 'TARGET',
      extra: { response_image_type: 'jpeg' },
    })
  })
})

describe('parseMergeFaceResponse', () => {
  it('returns the base64 payload and mime type on success', () => {
    expect(
      parseMergeFaceResponse({
        task: { task_id: 'x', status: 'TASK_STATUS_SUCCEED' },
        image_file: 'AAAA',
        image_type: 'jpeg',
      }),
    ).toEqual({ base64: 'AAAA', contentType: 'image/jpeg' })
  })

  it('maps the declared image type to a mime type', () => {
    expect(parseMergeFaceResponse({ image_file: 'A', image_type: 'png' }).contentType).toBe(
      'image/png',
    )
    expect(parseMergeFaceResponse({ image_file: 'A', image_type: 'WEBP' }).contentType).toBe(
      'image/webp',
    )
    // Unknown / absent type — the request always asks for jpeg.
    expect(parseMergeFaceResponse({ image_file: 'A' }).contentType).toBe('image/jpeg')
  })

  it('throws on a failed task, surfacing the provider reason', () => {
    expect(() =>
      parseMergeFaceResponse({
        task: { status: 'TASK_STATUS_FAILED', reason: 'no face detected' },
        image_file: 'AAAA',
      }),
    ).toThrow(/TASK_STATUS_FAILED.*no face detected/)
  })

  it('throws when the image is missing or empty', () => {
    expect(() => parseMergeFaceResponse({ task: { status: 'TASK_STATUS_SUCCEED' } })).toThrow(
      /missing image_file/,
    )
    expect(() => parseMergeFaceResponse({ image_file: '' })).toThrow(/missing image_file/)
    expect(() => parseMergeFaceResponse({ image_file: 123 })).toThrow(/missing image_file/)
  })

  it('throws on a non-object response', () => {
    expect(() => parseMergeFaceResponse(null)).toThrow(/non-object/)
    expect(() => parseMergeFaceResponse('boom')).toThrow(/non-object/)
  })
})
