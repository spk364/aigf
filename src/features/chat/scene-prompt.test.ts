import { describe, it, expect } from 'vitest'
import { buildCharacterEditPrompt } from './scene-prompt'

describe('buildCharacterEditPrompt', () => {
  it('instructs the model to keep identity and only restyle the scene', () => {
    const { prompt } = buildCharacterEditPrompt({
      scene: 'lying on the bed, in lingerie',
      artStyle: 'realistic',
    })
    expect(prompt).toMatch(/same person and identity/i)
    expect(prompt).toContain('lying on the bed, in lingerie')
    expect(prompt).toMatch(/photorealistic/i)
    // Must NOT re-describe a fresh subject (that re-rolls a new face).
    expect(prompt).not.toMatch(/RAW photo/i)
  })

  it('never mentions body markings (mentioning them — even to forbid — primes the model to add them)', () => {
    const { prompt } = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'realistic' })
    expect(prompt).not.toMatch(/tattoo/i)
    expect(prompt).not.toMatch(/piercing/i)
    expect(prompt).not.toMatch(/\bscars?\b/i)
    expect(prompt).not.toMatch(/marking/i)
    // Identity is still preserved via the generic "same … body" wording.
    expect(prompt).toMatch(/same skin and same body/i)
  })

  it('uses the anime style phrase for anime characters', () => {
    const { prompt } = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'anime' })
    expect(prompt).toMatch(/anime art style/i)
    expect(prompt).not.toMatch(/photorealistic/i)
  })

  it('directs explicit nudity depiction only when explicit', () => {
    const explicit = buildCharacterEditPrompt({ scene: 'topless', explicit: true }).prompt
    expect(explicit).toMatch(/undress the subject/i)
    expect(explicit).toMatch(/remove all clothing/i)
    expect(explicit).toMatch(/do not cover, censor, blur, add lingerie, or re-clothe/i)
    // Explicit must NOT use the "change the outfit" framing (implies clothing kept).
    expect(explicit).not.toMatch(/change only the outfit/i)
    const clothed = buildCharacterEditPrompt({ scene: 'in a dress' }).prompt
    expect(clothed).not.toMatch(/nudity/i)
    expect(clothed).toMatch(/change only the outfit/i)
  })

  it('falls back to a default scene when none is given', () => {
    const { prompt } = buildCharacterEditPrompt({ artStyle: 'realistic' })
    expect(prompt).toMatch(/selfie/i)
  })
})
