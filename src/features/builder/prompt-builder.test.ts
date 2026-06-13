import { describe, it, expect } from 'vitest'
import { pickModelIdForStyle, isPonyModelId, isSd15ModelId } from './prompt-builder'

describe('pickModelIdForStyle', () => {
  it('routes explicit by style to the Novita SDXL defaults (anime + realistic)', () => {
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('novita/anime')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('novita/realistic')
    // Both defaults are Pony/Illustrious SDXL → score tags + SDXL res.
    expect(isPonyModelId('novita/anime')).toBe(true)
    expect(isPonyModelId('novita/realistic')).toBe(true)
    expect(isSd15ModelId('novita/realistic')).toBe(false)
    expect(isSd15ModelId('novita/anime')).toBe(false)
  })

  it('a warm fal endpoint (FAL_NSFW_*) overrides Novita', () => {
    const prev = { ...process.env }
    process.env.FAL_NSFW_ANIME_ENDPOINT = 'fal-ai/my-warm-illustrious'
    process.env.FAL_NSFW_REALISTIC_ENDPOINT = 'fal-ai/my-warm-pony'
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('fal-ai/my-warm-illustrious')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('fal-ai/my-warm-pony')
    expect(isPonyModelId('fal-ai/my-warm-illustrious')).toBe(true)
    expect(isPonyModelId('fal-ai/my-warm-pony')).toBe(true)
    process.env.FAL_NSFW_ANIME_ENDPOINT = prev.FAL_NSFW_ANIME_ENDPOINT
    process.env.FAL_NSFW_REALISTIC_ENDPOINT = prev.FAL_NSFW_REALISTIC_ENDPOINT
  })

  it('does NOT treat Atlas WAN as a Pony model', () => {
    expect(isPonyModelId('alibaba/wan-2.6/text-to-image')).toBe(false)
  })

  it('flags catalogue Pony/Illustrious checkpoints', () => {
    expect(isPonyModelId('John6666/wai-nsfw-illustrious-sdxl-v150-sdxl')).toBe(true)
    expect(isPonyModelId('John6666/cyberrealistic-pony-v110-sdxl')).toBe(true)
  })

  it('uses the warm FLUX defaults for non-explicit scenes', () => {
    expect(pickModelIdForStyle('anime')).toBe('fal-ai/flux/schnell')
    expect(pickModelIdForStyle('realistic')).toBe('fal-ai/flux/dev')
  })
})
