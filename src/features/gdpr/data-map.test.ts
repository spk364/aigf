import { describe, it, expect } from 'vitest'
import { USER_DATA_SOURCES, USER_PII_FIELDS, PURGE_GRACE_DAYS } from './data-map'

describe('GDPR data-map invariants', () => {
  it('every source has a userField and a valid purge mode', () => {
    for (const s of USER_DATA_SOURCES) {
      expect(s.userField.length).toBeGreaterThan(0)
      expect(['delete', 'retain']).toContain(s.purge)
    }
  })

  it('safety/compliance records are never exported', () => {
    const excluded = ['safety-incidents', 'content-flags', 'age-verifications']
    for (const slug of excluded) {
      const src = USER_DATA_SOURCES.find((s) => s.collection === slug)
      expect(src, `${slug} should be in the map`).toBeDefined()
      expect(src!.export, `${slug} must NOT be exported`).toBe(false)
    }
  })

  it('financial + compliance records are retained, personal content is deleted', () => {
    const retained = ['payment-transactions', 'token-transactions', 'subscriptions', 'age-verifications', 'safety-incidents', 'content-flags']
    const deleted = ['conversations', 'memory-entries', 'character-drafts', 'characters', 'media-assets', 'token-balances']
    for (const slug of retained) {
      expect(USER_DATA_SOURCES.find((s) => s.collection === slug)?.purge).toBe('retain')
    }
    for (const slug of deleted) {
      expect(USER_DATA_SOURCES.find((s) => s.collection === slug)?.purge).toBe('delete')
    }
  })

  it('no duplicate collections', () => {
    const slugs = USER_DATA_SOURCES.map((s) => s.collection)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('grace window is 90 days and PII fields are non-empty', () => {
    expect(PURGE_GRACE_DAYS).toBe(90)
    expect(USER_PII_FIELDS.length).toBeGreaterThan(0)
  })
})
