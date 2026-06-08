import { describe, it, expect } from 'vitest'
import {
  isExplicitPhotoScene,
  looksLikePhotoRefusal,
  photoSendCaption,
  stripPhotoImperatives,
  explicitNudityTokens,
  resolveExplicitScene,
} from './photo-consistency'

describe('isExplicitPhotoScene', () => {
  it('flags outright nudity (the reported prompt)', () => {
    expect(
      isExplicitPhotoScene(
        'a mirror selfie, in swimwear, at home, no bra, naked tits',
      ),
    ).toBe(true)
  })

  it('flags nudity across locales', () => {
    expect(isExplicitPhotoScene('покажи свои голые сиськи')).toBe(true)
    expect(isExplicitPhotoScene('enséñame tus tetas, desnuda')).toBe(true)
    expect(isExplicitPhotoScene('topless on the bed')).toBe(true)
  })

  it('does NOT flag clothed-sexy scenes (stay on the fast FLUX path)', () => {
    expect(isExplicitPhotoScene('lying on the bed, in lingerie, in the bedroom')).toBe(false)
    expect(isExplicitPhotoScene('in a swimsuit at the beach')).toBe(false)
    expect(isExplicitPhotoScene('a cute selfie in a sundress')).toBe(false)
    expect(isExplicitPhotoScene('')).toBe(false)
    expect(isExplicitPhotoScene(null)).toBe(false)
  })
})

describe('looksLikePhotoRefusal', () => {
  it('catches the reported refusal (ru)', () => {
    expect(
      looksLikePhotoRefusal(
        'Я ценю твой интерес, но предпочитаю сохранять немного загадочности в наших разговорах. Может, лучше поговорим о новых тату-проектах?',
      ),
    ).toBe(true)
  })

  it('catches common en/es deflections', () => {
    expect(looksLikePhotoRefusal("I'd rather keep some mystery for now 😉")).toBe(true)
    expect(looksLikePhotoRefusal('Maybe later, handsome')).toBe(true)
    expect(looksLikePhotoRefusal('Prefiero un poco de misterio')).toBe(true)
  })

  it('catches generic assistant-style policy refusals (the reported case)', () => {
    expect(
      looksLikePhotoRefusal(
        "I'm sorry, but I can't comply with this request. I aim to keep interactions " +
          "respectful and appropriate. Let me know if there's anything else I can help with! 💕 *hugs sweater sleeves*",
      ),
    ).toBe(true)
    expect(looksLikePhotoRefusal("I can't fulfill that request.")).toBe(true)
    expect(looksLikePhotoRefusal('Извини, но я не могу выполнить эту просьбу.')).toBe(true)
    expect(looksLikePhotoRefusal('Lo siento, no puedo cumplir con esa solicitud.')).toBe(true)
  })

  it('leaves a willing caption untouched', () => {
    expect(looksLikePhotoRefusal('Here you go, just for you 😏')).toBe(false)
    expect(looksLikePhotoRefusal('Mmm, snapped this just now 📸🔥')).toBe(false)
    expect(looksLikePhotoRefusal('')).toBe(false)
  })
})

describe('photoSendCaption', () => {
  it('returns a non-empty localized caption and is deterministic per seed', () => {
    for (const loc of ['en', 'ru', 'es']) {
      const a = photoSendCaption(loc, 42)
      expect(a.length).toBeGreaterThan(0)
      expect(photoSendCaption(loc, 42)).toBe(a) // stable
    }
  })

  it('falls back to English for unknown locales', () => {
    expect(photoSendCaption('zz', 1).length).toBeGreaterThan(0)
  })
})

describe('stripPhotoImperatives', () => {
  it('removes an embedded "send me … photo" clause', () => {
    expect(
      stripPhotoImperatives('lying on the bed, relaxed, in the bedroom, send me your full naked photo'),
    ).toBe('lying on the bed, relaxed, in the bedroom')
  })
  it('leaves a plain descriptive scene untouched', () => {
    expect(stripPhotoImperatives('lying on the bed in lingerie')).toBe('lying on the bed in lingerie')
  })
})

describe('explicitNudityTokens', () => {
  it('maps full-nudity requests to a clear depiction', () => {
    expect(explicitNudityTokens('send me your full naked photo')).toMatch(/completely nude, fully naked/)
    expect(explicitNudityTokens('покажи себя голой')).toMatch(/completely nude/)
  })
  it('maps partial nudity to specific parts', () => {
    expect(explicitNudityTokens('topless, no bra')).toMatch(/topless, bare breasts/)
    expect(explicitNudityTokens('bottomless, no panties')).toMatch(/bottomless/)
  })
  it('returns empty for non-nude text', () => {
    expect(explicitNudityTokens('in a red dress on the bed')).toBe('')
  })
})

describe('resolveExplicitScene', () => {
  it('reproduces the reported case: imperative stripped, nudity depicted', () => {
    const out = resolveExplicitScene({
      scene: 'lying on the bed, relaxed, in the bedroom, send me your full naked photo',
      message: 'Send me a photo of you lying on the bed, relaxed, in the bedroom, send me your full naked photo',
      explicit: true,
    })
    expect(out).toContain('lying on the bed, relaxed, in the bedroom')
    expect(out).toMatch(/completely nude, fully naked/)
    expect(out).not.toMatch(/send me/i)
  })
  it('is a no-op when not explicit', () => {
    expect(resolveExplicitScene({ scene: 'in a dress at a cafe', message: 'x', explicit: false }))
      .toBe('in a dress at a cafe')
  })
})
