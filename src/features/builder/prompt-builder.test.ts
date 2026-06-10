import { describe, it, expect } from 'vitest'
import { pickModelIdForStyle } from './prompt-builder'

describe('pickModelIdForStyle', () => {
  it('routes explicit by style: anime → warm Novita Pony, realistic → warm Atlas WAN', () => {
    // Anime nudity needs a Pony/Illustrious checkpoint (WAN re-clothes anime);
    // Novita serves it always-warm. Realistic stays on warm Atlas WAN.
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('novita/pony-v6-xl')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('alibaba/wan-2.6/text-to-image')
    // Never the cold fal-ai/lora checkpoint that times out.
    expect(pickModelIdForStyle('anime', { explicit: true })).not.toContain('John6666')
  })

  it('uses the warm FLUX defaults for non-explicit scenes', () => {
    expect(pickModelIdForStyle('anime')).toBe('fal-ai/flux/schnell')
    expect(pickModelIdForStyle('realistic')).toBe('fal-ai/flux/dev')
  })
})
