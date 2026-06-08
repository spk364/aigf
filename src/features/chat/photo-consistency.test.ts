import { describe, it, expect } from 'vitest'
import {
  isExplicitPhotoScene,
  looksLikePhotoRefusal,
  photoSendCaption,
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
