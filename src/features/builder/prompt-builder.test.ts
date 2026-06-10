import { describe, it, expect } from 'vitest'
import { pickModelIdForStyle } from './prompt-builder'

describe('pickModelIdForStyle', () => {
  it('routes explicit requests (both styles) to the warm Atlas WAN t2i', () => {
    // The true-anime Illustrious LoRA cold-starts and times out, so anime+explicit
    // must NOT route there — it uses the always-warm Atlas WAN like realistic.
    expect(pickModelIdForStyle('anime', { explicit: true })).toBe('alibaba/wan-2.6/text-to-image')
    expect(pickModelIdForStyle('realistic', { explicit: true })).toBe('alibaba/wan-2.6/text-to-image')
    // Never the cold fal-ai/lora checkpoint.
    expect(pickModelIdForStyle('anime', { explicit: true })).not.toContain('John6666')
  })

  it('uses the warm FLUX defaults for non-explicit scenes', () => {
    expect(pickModelIdForStyle('anime')).toBe('fal-ai/flux/schnell')
    expect(pickModelIdForStyle('realistic')).toBe('fal-ai/flux/dev')
  })
})
