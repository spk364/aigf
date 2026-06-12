import { describe, it, expect } from 'vitest'
import { pickModelIdForStyle, isPonyModelId } from './prompt-builder'

describe('pickModelIdForStyle', () => {
  it('routes explicit to the warm Novita Pony by default (both styles)', () => {
    // Novita is warm out of the box; fal Pony/Illustrious cold-start and time out.
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('novita/pony-v6-xl')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('novita/realistic')
    // Novita ids are Pony → get the score tags.
    expect(isPonyModelId('novita/pony-v6-xl')).toBe(true)
    expect(isPonyModelId('novita/realistic')).toBe(true)
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
