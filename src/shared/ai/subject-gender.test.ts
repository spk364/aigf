import { describe, it, expect } from 'vitest'
import { resolveCharacterGender } from './subject-gender'

describe('resolveCharacterGender', () => {
  it('reads the builder appearance field', () => {
    expect(resolveCharacterGender({ appearance: { gender: 'male' } })).toBe('male')
    expect(resolveCharacterGender({ appearance: { gender: 'female' } })).toBe('female')
  })

  it('reads the nested params shape the seed writes', () => {
    expect(resolveCharacterGender({ appearance: { params: { gender: 'male' } } })).toBe('male')
  })

  it('falls back to the catalog category for seeded boys', () => {
    // Seeded boys carry no gender field — only `category: 'boys'` and male
    // appearance text.
    expect(resolveCharacterGender({ category: 'boys', appearance: {} })).toBe('male')
  })

  it('reads the pre-assembled appearance text when nothing else says', () => {
    expect(
      resolveCharacterGender({
        appearance: {
          subjectTokens: 'caucasian 30 year old man, athletic toned body, short messy hair',
          safetyAdultMarkers: ['adult man', '(adult:1.1)'],
        },
      }),
    ).toBe('male')
  })

  it('is not fooled by "woman" containing "man"', () => {
    expect(
      resolveCharacterGender({
        appearance: { subjectTokens: 'latina 24 year old woman, long wavy hair' },
      }),
    ).toBe('female')
  })

  it('defaults to female — what every character rendered as before', () => {
    expect(resolveCharacterGender(null)).toBe('female')
    expect(resolveCharacterGender({})).toBe('female')
    expect(resolveCharacterGender({ appearance: { subjectTokens: 'freckles, green eyes' } })).toBe(
      'female',
    )
  })
})
