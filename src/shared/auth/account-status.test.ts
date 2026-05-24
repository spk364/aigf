import { describe, it, expect } from 'vitest'
import { getAccountState } from './account-status'

describe('getAccountState', () => {
  it('allows an active user', () => {
    expect(getAccountState({ status: 'active' }).blocked).toBe(false)
  })

  it('allows when status is missing', () => {
    expect(getAccountState({}).blocked).toBe(false)
    expect(getAccountState(null).blocked).toBe(false)
  })

  it('blocks a banned user', () => {
    const s = getAccountState({ status: 'banned' })
    expect(s.blocked).toBe(true)
    if (s.blocked) expect(s.reason).toBe('banned')
  })

  it('blocks a deleted user', () => {
    expect(getAccountState({ status: 'deleted' }).blocked).toBe(true)
  })

  it('blocks a suspended user whose suspension is still active', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const s = getAccountState({ status: 'suspended', suspendedUntil: future })
    expect(s.blocked).toBe(true)
    if (s.blocked) expect(s.reason).toBe('suspended')
  })

  it('allows a suspended user whose suspension has expired', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    expect(getAccountState({ status: 'suspended', suspendedUntil: past }).blocked).toBe(false)
  })

  it('blocks a suspended user with no expiry set', () => {
    expect(getAccountState({ status: 'suspended' }).blocked).toBe(true)
  })
})
