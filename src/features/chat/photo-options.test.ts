import { describe, it, expect } from 'vitest'
import {
  buildPhotoRequest,
  fragmentFor,
  PHOTO_OPTION_GROUPS,
  sceneFromPhotoRequest,
} from './photo-options'
import { detectImageIntent } from './intent-detection'
import { classifyShot } from './shot-framing'

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

describe('sceneFromPhotoRequest', () => {
  it('strips the "send me a photo of you" lead and keeps the description', () => {
    expect(
      sceneFromPhotoRequest(
        'Send me a photo of you lying on the bed, relaxed, in swimwear, on the beach at sunset',
      ),
    ).toBe('lying on the bed, relaxed, in swimwear, on the beach at sunset')
  })

  it('returns empty for a bare selfie request (no real scene)', () => {
    expect(sceneFromPhotoRequest('Send me a selfie')).toBe('')
    expect(sceneFromPhotoRequest('send me a photo')).toBe('')
    expect(sceneFromPhotoRequest('пришли селфи')).toBe('')
  })

  it('handles "take a selfie of yourself …"', () => {
    expect(sceneFromPhotoRequest('Take a selfie of yourself on the beach')).toBe('on the beach')
  })

  it('strips a dangling subject word and verb lead', () => {
    expect(sceneFromPhotoRequest('Show me your full body in that dress')).toBe(
      'your full body in that dress',
    )
  })

  it('handles Russian requests', () => {
    expect(sceneFromPhotoRequest('Отправь мне фото как ты лежишь на пляже в купальнике')).toBe(
      'как ты лежишь на пляже в купальнике',
    )
    expect(sceneFromPhotoRequest('Покажи мне себя в полный рост')).toBe('в полный рост')
  })

  it('feeds a recovered scene into the right shot framing (the reported bug)', () => {
    // A bare [SEND_PHOTO] would lose this; recovering it must yield a full-body
    // shot, not a face selfie.
    const scene = sceneFromPhotoRequest(
      'Send me a photo of you lying on the bed, relaxed, in swimwear, on the beach at sunset',
    )
    expect(classifyShot(scene)).toBe('full_body_wide')
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
