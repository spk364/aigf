import { describe, it, expect } from 'vitest'
import { buildCharacterEditPrompt, buildCharacterScenePrompt } from './scene-prompt'

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

  it('steers realistic edits to a natural iris (not anime)', () => {
    const realistic = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'realistic' }).prompt
    expect(realistic).toMatch(/true-to-reference eye color/i)
    expect(realistic).toMatch(/not glowing, neon, or oversaturated/i)
    const anime = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'anime' }).prompt
    expect(anime).not.toMatch(/eye color/i)
  })
})

describe('buildCharacterScenePrompt natural eyes', () => {
  const realisticAppearance = {
    subjectTokens: 'caucasian 25 year old woman, blonde hair, blue eyes',
    negativePrompt: 'ugly',
  }

  it('adds a natural-iris positive and negative for realistic scenes', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: realisticAppearance,
      artStyle: 'realistic',
      scene: 'lying on the bed',
    })
    expect(prompt).toMatch(/natural realistic eye color/i)
    expect(negativePrompt).toMatch(/glowing eyes/i)
    expect(negativePrompt).toMatch(/neon eyes/i)
  })

  it('leaves anime scenes vivid (no iris restraint)', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { appearancePrompt: 'anime girl, green eyes' },
      artStyle: 'anime',
      scene: 'at a cafe',
    })
    expect(prompt).not.toMatch(/natural realistic eye color/i)
    expect(negativePrompt).not.toMatch(/glowing eyes/i)
  })
})

describe('buildCharacterScenePrompt anime style hardening', () => {
  // Anime + explicit is served by the warm Atlas WAN t2i (photoreal prior), so
  // the prompt must hard-assert 2D anime and push photoreal into the negative —
  // otherwise an "anime" nude comes back semi-realistic.
  it('asserts 2D anime style and rejects photoreal for anime scenes', () => {
    const { prompt, negativePrompt } = buildCharacterScenePrompt({
      appearance: { appearancePrompt: 'anime girl, twin tails' },
      artStyle: 'anime',
      scene: 'topless, bare breasts',
    })
    expect(prompt).toMatch(/2D anime illustration/i)
    expect(prompt).toMatch(/cel-shaded/i)
    expect(prompt).toMatch(/NOT photorealistic/i)
    expect(negativePrompt).toMatch(/\(photorealistic:1\.4\)/i)
    expect(negativePrompt).toMatch(/semi-realistic/i)
  })

  it('does NOT add the anime style assertion to realistic scenes', () => {
    const { prompt } = buildCharacterScenePrompt({
      appearance: { subjectTokens: 'woman, brown hair' },
      artStyle: 'realistic',
      scene: 'topless',
    })
    expect(prompt).not.toMatch(/2D anime illustration/i)
  })
})
