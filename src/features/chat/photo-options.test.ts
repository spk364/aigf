import { describe, it, expect } from 'vitest'
import {
  allPhotoOptionLabelKeys,
  buildPhotoRequest,
  fragmentFor,
  photoOptionGroupsFor,
  PHOTO_OPTION_GROUPS,
  sceneFromPhotoRequest,
} from './photo-options'
import enMessages from '@/i18n/messages/en.json'
import ruMessages from '@/i18n/messages/ru.json'
import esMessages from '@/i18n/messages/es.json'
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

  it('every label key the composer can ask for is translated in all locales', () => {
    const keys = allPhotoOptionLabelKeys()
    for (const [locale, messages] of [
      ['en', enMessages],
      ['ru', ruMessages],
      ['es', esMessages],
    ] as const) {
      const options = messages.chat.photoComposer.options as Record<
        string,
        Record<string, string>
      >
      for (const key of keys) {
        const [group, name] = key.split('.') as [string, string]
        expect(options[group]?.[name], `${locale} is missing options.${key}`).toBeTruthy()
      }
    }
  })
})

describe('photoOptionGroupsFor', () => {
  const keysOf = (gender: 'female' | 'male', group: string) =>
    photoOptionGroupsFor(gender)
      .find((g) => g.group === group)!
      .options.map((o) => o.key)

  it('does not offer a dress or lingerie on a boyfriend thread', () => {
    const male = keysOf('male', 'outfit')
    expect(male).not.toContain('dress')
    expect(male).not.toContain('lingerie')
    expect(male).toEqual(expect.arrayContaining(['shirtless', 'boxers', 'open_shirt']))
  })

  it('does not offer the male-only chips on a girlfriend thread', () => {
    const female = keysOf('female', 'outfit')
    expect(female).toEqual(expect.arrayContaining(['dress', 'lingerie']))
    expect(female).not.toContain('shirtless')
    expect(female).not.toContain('boxers')
    expect(keysOf('female', 'pose')).not.toContain('flexing')
  })

  it('defaults to the female sheet', () => {
    expect(photoOptionGroupsFor()).toEqual(photoOptionGroupsFor('female'))
  })

  it('retunes a shared chip whose neutral wording still reads female', () => {
    const swim = (gender: 'female' | 'male') =>
      photoOptionGroupsFor(gender)
        .find((g) => g.group === 'outfit')!
        .options.find((o) => o.key === 'swimwear')!
    // "in swimwear" resolves to a bikini; a boyfriend needs shorts.
    expect(swim('female').prompt).toBe('in swimwear')
    expect(swim('male').prompt).toBe('in swim shorts, bare chest')
    // …and the chip label follows, since RU has no shared noun for the two.
    expect(swim('male').labelKey).toBe('outfit.swimwearMale')
    expect(ruMessages.chat.photoComposer.options.outfit.swimwearMale).toBe('Плавки')
  })

  it('keeps the shared chips identical apart from the gendered ones', () => {
    const shared = keysOf('female', 'setting')
    expect(keysOf('male', 'setting')).toEqual(shared)
  })
})

describe('fragmentFor', () => {
  it('resolves the male variant when asked', () => {
    expect(fragmentFor('outfit', 'swimwear', 'male')).toBe('in swim shorts, bare chest')
    expect(fragmentFor('outfit', 'swimwear')).toBe('in swimwear')
  })
})
