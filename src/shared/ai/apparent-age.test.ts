import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/shared/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { parseAgeReply } from './apparent-age'

describe('parseAgeReply', () => {
  it('parses clean JSON', () => {
    const r = parseAgeReply('{"apparentAge": 27, "minorRisk": false}')
    expect(r.apparentAge).toBe(27)
    expect(r.minorRisk).toBe(false)
  })

  it('parses JSON wrapped in prose / markdown fences', () => {
    const r = parseAgeReply('Here is my answer:\n```json\n{"apparentAge": 16, "minorRisk": true}\n```')
    expect(r.apparentAge).toBe(16)
    expect(r.minorRisk).toBe(true)
  })

  it('coerces a stringified age', () => {
    const r = parseAgeReply('{"apparentAge": "30", "minorRisk": false}')
    expect(r.apparentAge).toBe(30)
  })

  it('falls back to lexical minor detection without JSON', () => {
    const r = parseAgeReply('This appears to be a teenager, likely a minor.')
    expect(r.minorRisk).toBe(true)
  })

  it('falls back to a bare number when no JSON', () => {
    const r = parseAgeReply('She looks about 24 years old.')
    expect(r.apparentAge).toBe(24)
  })

  it('does not assert minorRisk on a clearly adult lexical reply', () => {
    const r = parseAgeReply('A mature woman, around 35.')
    expect(r.apparentAge).toBe(35)
    expect(r.minorRisk).toBeNull()
  })
})
