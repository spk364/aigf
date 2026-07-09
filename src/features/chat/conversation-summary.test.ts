import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// env.ts validates required vars at import time and process.exit(1)s in the
// test environment — stub it; the cadence tests never touch the network.
vi.mock('@/shared/config/env', () => ({ env: { OPENROUTER_API_KEY: '' } }))

import {
  shouldUpdateSummary,
  SUMMARY_MIN_MESSAGES,
  SUMMARY_EVERY_USER_MESSAGES,
} from './conversation-summary'

describe('shouldUpdateSummary', () => {
  it('never fires below the minimum message count', () => {
    for (let n = 0; n < SUMMARY_MIN_MESSAGES; n++) {
      expect(shouldUpdateSummary(n)).toBe(false)
    }
  })

  it('fires periodically on even counts (conversations without a greeting)', () => {
    // Without a greeting: each turn adds 2, counts go 24, 26, 28, …
    const fired: number[] = []
    for (let n = SUMMARY_MIN_MESSAGES; n <= SUMMARY_MIN_MESSAGES + 40; n += 2) {
      if (shouldUpdateSummary(n)) fired.push(n)
    }
    expect(fired.length).toBeGreaterThan(0)
    // Consecutive firings are SUMMARY_EVERY_USER_MESSAGES user turns apart.
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i]! - fired[i - 1]!).toBe(SUMMARY_EVERY_USER_MESSAGES * 2)
    }
  })

  it('fires periodically on odd counts (greeting makes the counter odd)', () => {
    // With a greeting: counts go 25, 27, 29, … — the old exact-division memory
    // cadence check could never fire on these; the floor-based check must.
    const fired: number[] = []
    for (let n = SUMMARY_MIN_MESSAGES + 1; n <= SUMMARY_MIN_MESSAGES + 41; n += 2) {
      if (shouldUpdateSummary(n)) fired.push(n)
    }
    expect(fired.length).toBeGreaterThan(0)
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i]! - fired[i - 1]!).toBe(SUMMARY_EVERY_USER_MESSAGES * 2)
    }
  })
})
