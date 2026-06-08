import { describe, it, expect } from 'vitest'
import { buildCharacterEditPrompt } from './scene-prompt'

describe('buildCharacterEditPrompt', () => {
  it('instructs the model to keep identity and only restyle the scene', () => {
    const { prompt } = buildCharacterEditPrompt({
      scene: 'lying on the bed, in lingerie',
      artStyle: 'realistic',
    })
    expect(prompt).toMatch(/same person and identity/i)
    expect(prompt).toMatch(/tattoos/i)
    expect(prompt).toContain('lying on the bed, in lingerie')
    expect(prompt).toMatch(/photorealistic/i)
    // Must NOT re-describe a fresh subject (that re-rolls a new face).
    expect(prompt).not.toMatch(/RAW photo/i)
  })

  it('uses the anime style phrase for anime characters', () => {
    const { prompt } = buildCharacterEditPrompt({ scene: 'at a cafe', artStyle: 'anime' })
    expect(prompt).toMatch(/anime art style/i)
    expect(prompt).not.toMatch(/photorealistic/i)
  })

  it('permits nudity only when explicit', () => {
    expect(buildCharacterEditPrompt({ scene: 'topless', explicit: true }).prompt).toMatch(/nudity is allowed/i)
    expect(buildCharacterEditPrompt({ scene: 'in a dress' }).prompt).not.toMatch(/nudity is allowed/i)
  })

  it('falls back to a default scene when none is given', () => {
    const { prompt } = buildCharacterEditPrompt({ artStyle: 'realistic' })
    expect(prompt).toMatch(/selfie/i)
  })
})
