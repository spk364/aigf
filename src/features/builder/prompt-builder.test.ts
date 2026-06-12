import { describe, it, expect } from 'vitest'
import { pickModelIdForStyle, isPonyModelId } from './prompt-builder'

describe('pickModelIdForStyle', () => {
  it('routes explicit to fal Pony/Illustrious: anime → Illustrious, realistic → CyberRealistic Pony', () => {
    // Only Pony/Illustrious render uncensored nudity AND honour the described
    // identity (Atlas WAN returned clothed/wrong-ethnicity). Both default to a
    // fal checkpoint; override per style via FAL_NSFW_*_ENDPOINT (warm endpoint).
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe(
      'John6666/wai-nsfw-illustrious-sdxl-v150-sdxl',
    )
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe(
      'John6666/cyberrealistic-pony-v110-sdxl',
    )
  })

  it('honours the FAL_NSFW_* env overrides (warm endpoints)', () => {
    const prev = { ...process.env }
    process.env.FAL_NSFW_ANIME_ENDPOINT = 'fal-ai/my-warm-illustrious'
    process.env.FAL_NSFW_REALISTIC_ENDPOINT = 'fal-ai/my-warm-pony'
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('fal-ai/my-warm-illustrious')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('fal-ai/my-warm-pony')
    // A custom warm endpoint is treated as Pony so the score tags get added.
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
