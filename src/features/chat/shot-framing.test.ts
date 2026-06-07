import { describe, it, expect } from 'vitest'
import {
  classifyShot,
  shotImageSize,
  shotFramingTokens,
  type ShotType,
} from './shot-framing'

describe('classifyShot', () => {
  it('defaults to portrait for empty/blank scenes', () => {
    expect(classifyShot('')).toBe('portrait')
    expect(classifyShot('   ')).toBe('portrait')
    expect(classifyShot(undefined)).toBe('portrait')
    expect(classifyShot(null)).toBe('portrait')
  })

  it('routes reclining poses to a wide full-body shot', () => {
    // The original bug report: lying scene came back as a face selfie.
    expect(classifyShot('lying on the bed, relaxed, wearing an elegant dress, in a cozy cafe')).toBe(
      'full_body_wide',
    )
    expect(classifyShot('laying on the couch')).toBe('full_body_wide')
    expect(classifyShot('лёжа на кровати в платье')).toBe('full_body_wide')
    expect(classifyShot('acostada en la cama')).toBe('full_body_wide')
  })

  it('reclining outranks the cafe/outfit hints alongside it', () => {
    // "in a cozy cafe" alone is half_body, but the lying pose must win.
    expect(classifyShot('lying down in a cozy cafe')).toBe('full_body_wide')
  })

  it('routes upright full-body / outfit-reveal requests to full_body', () => {
    expect(classifyShot('standing in a full body shot')).toBe('full_body')
    expect(classifyShot('full length, head to toe')).toBe('full_body')
    expect(classifyShot('show me your outfit')).toBe('full_body')
    expect(classifyShot('walking in the city')).toBe('full_body')
    expect(classifyShot('в полный рост у окна')).toBe('full_body')
    expect(classifyShot('de cuerpo entero')).toBe('full_body')
  })

  it('treats a mirror selfie as full body before the plain selfie rule', () => {
    expect(classifyShot('a mirror selfie')).toBe('full_body')
  })

  it('keeps a plain selfie a selfie', () => {
    expect(classifyShot('taking a selfie, smiling')).toBe('selfie')
    expect(classifyShot('сделай селфи')).toBe('selfie')
  })

  it('maps seated scenes to a half-body shot', () => {
    expect(classifyShot('sitting by the window')).toBe('half_body')
    expect(classifyShot('in a cozy cafe')).toBe('half_body')
    expect(classifyShot('сидя за столом')).toBe('half_body')
  })

  it('detects explicit close-ups', () => {
    expect(classifyShot('close-up of your face')).toBe('closeup')
    expect(classifyShot('крупным планом')).toBe('closeup')
  })

  it('does not let short words match inside larger words', () => {
    // "sit" must not fire on "position", "stand" not on "understand".
    expect(classifyShot('in a flattering position')).toBe('portrait')
    expect(classifyShot('looking like you understand me')).toBe('portrait')
  })
})

describe('shotImageSize', () => {
  it('keeps head/torso shots in the portrait 2:3 bucket', () => {
    for (const shot of ['selfie', 'closeup', 'portrait', 'half_body'] as ShotType[]) {
      expect(shotImageSize(shot)).toEqual({ width: 832, height: 1216 })
    }
  })

  it('gives upright full body a taller frame', () => {
    expect(shotImageSize('full_body')).toEqual({ width: 768, height: 1344 })
  })

  it('gives reclining full body a landscape frame', () => {
    expect(shotImageSize('full_body_wide')).toEqual({ width: 1216, height: 832 })
  })
})

describe('shotFramingTokens', () => {
  it('emits full-body composition tokens plus an anti-crop negative for realistic SDXL', () => {
    const t = shotFramingTokens('full_body_wide', {})
    expect(t.positive).toContain('full body')
    expect(t.negative).toContain('close-up')
  })

  it('uses danbooru-style tags for anime', () => {
    expect(shotFramingTokens('full_body', { isAnime: true }).positive).toContain('full body')
    expect(shotFramingTokens('half_body', { isAnime: true }).positive).toContain('cowboy shot')
  })

  it('uses a natural-language sentence and no negative for FLUX', () => {
    const t = shotFramingTokens('full_body', { isFlux: true })
    expect(t.positive).toMatch(/full-body shot/i)
    expect(t.negative).toBe('')
  })
})
