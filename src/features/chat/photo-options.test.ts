import { describe, it, expect } from 'vitest'
import { buildPhotoRequest, fragmentFor, PHOTO_OPTION_GROUPS } from './photo-options'
import { detectImageIntent } from './intent-detection'

describe('buildPhotoRequest', () => {
  it('falls back to a plain selfie when nothing is selected', () => {
    expect(buildPhotoRequest({})).toBe('Send me a selfie')
  })

  it('composes pose + outfit + setting in order', () => {
    const msg = buildPhotoRequest({
      outfit: 'wearing an elegant dress',
      pose: 'taking a selfie, smiling',
      setting: 'on the beach at sunset',
    })
    expect(msg).toBe(
      'Send me a photo of you taking a selfie, smiling, wearing an elegant dress, on the beach at sunset',
    )
  })

  it('appends free-text extra', () => {
    const msg = buildPhotoRequest({ pose: 'a mirror selfie', extra: 'holding a coffee' })
    expect(msg).toContain('holding a coffee')
  })

  it('every assembled request still triggers image intent', () => {
    for (const a of [
      buildPhotoRequest({}),
      buildPhotoRequest({ outfit: 'in lingerie' }),
      buildPhotoRequest({ pose: 'lying on the bed, relaxed', setting: 'in the bedroom' }),
    ]) {
      expect(detectImageIntent(a, 'en')).toBe(true)
    }
  })
})

describe('fragmentFor', () => {
  it('resolves a known option', () => {
    expect(fragmentFor('outfit', 'dress')).toBe('wearing an elegant dress')
  })
  it('returns undefined for unknown', () => {
    expect(fragmentFor('outfit', 'nope')).toBeUndefined()
    expect(fragmentFor('nope', 'dress')).toBeUndefined()
  })
})

describe('option catalog integrity', () => {
  it('has unique keys within each group', () => {
    for (const g of PHOTO_OPTION_GROUPS) {
      const keys = g.options.map((o) => o.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
