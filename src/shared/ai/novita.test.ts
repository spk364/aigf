import { describe, it, expect } from 'vitest'
import { capPrompt } from './novita-prompt'

describe('capPrompt (Novita 1024-char limit)', () => {
  it('leaves short prompts untouched', () => {
    const s = 'score_9, anime girl, lying on the bed, nude'
    expect(capPrompt(s)).toBe(s)
  })

  it('trims an over-1024 prompt at the last comma boundary (no half-token)', () => {
    const long = Array.from({ length: 200 }, (_, i) => `token${i}`).join(', ')
    expect(long.length).toBeGreaterThan(1024)
    const out = capPrompt(long)
    expect(out.length).toBeLessThanOrEqual(1024)
    expect(out.endsWith(',')).toBe(false)
    expect(/token\d+$/.test(out)).toBe(true)
  })

  it('caps a realistic-length negative prompt (the reported 1063-char failure)', () => {
    const neg = 'a'.repeat(700) + ', ' + 'b'.repeat(200) + ', ' + 'c'.repeat(200)
    expect(neg.length).toBeGreaterThan(1024)
    expect(capPrompt(neg).length).toBeLessThanOrEqual(1024)
  })
})
