import { describe, it, expect } from 'vitest'
import {
  stageFromScore,
  resolveRelationshipStage,
  buildRelationshipBlock,
  daysSince,
} from './relationship-stage'

describe('stageFromScore', () => {
  it('maps score bands to stages', () => {
    expect(stageFromScore(0)).toBe('new')
    expect(stageFromScore(11)).toBe('new')
    expect(stageFromScore(12)).toBe('flirty')
    expect(stageFromScore(29)).toBe('flirty')
    expect(stageFromScore(30)).toBe('close')
    expect(stageFromScore(59)).toBe('close')
    expect(stageFromScore(60)).toBe('intimate')
    expect(stageFromScore(100)).toBe('intimate')
  })
})

describe('resolveRelationshipStage', () => {
  it('uses the score when the backstory starts at zero', () => {
    expect(resolveRelationshipStage(0, 'just_met')).toBe('new')
    expect(resolveRelationshipStage(35, 'just_met')).toBe('close')
  })

  it('never drops below the authored starting stage', () => {
    // Valentina starts 'relationship', Diana 'dating', Mikasa 'relationship' —
    // a fresh conversation (score 0) must not demote them to strangers.
    expect(resolveRelationshipStage(0, 'relationship')).toBe('close')
    expect(resolveRelationshipStage(0, 'dating')).toBe('flirty')
    expect(resolveRelationshipStage(0, 'long_term')).toBe('intimate')
  })

  it('score can advance past the starting stage', () => {
    expect(resolveRelationshipStage(70, 'dating')).toBe('intimate')
  })

  it('tolerates null / unknown inputs', () => {
    expect(resolveRelationshipStage(null, null)).toBe('new')
    expect(resolveRelationshipStage(undefined, 'custom made-up stage')).toBe('new')
  })
})

describe('buildRelationshipBlock', () => {
  it('describes the stage', () => {
    expect(buildRelationshipBlock('new')).toContain('getting to know')
    expect(buildRelationshipBlock('intimate')).toContain('long-term')
  })

  it('adds a welcome-back line only after 2+ days away', () => {
    expect(buildRelationshipBlock('close', 0)).not.toContain('away for about')
    expect(buildRelationshipBlock('close', 1.5)).not.toContain('away for about')
    const block = buildRelationshipBlock('close', 3.7)
    expect(block).toContain('away for about 3 days')
    expect(block).toContain('Never guilt-trip')
  })
})

describe('daysSince', () => {
  it('returns 0 for missing or future timestamps', () => {
    expect(daysSince(null)).toBe(0)
    expect(daysSince(new Date(Date.now() + 60_000).toISOString())).toBe(0)
  })

  it('measures elapsed days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(daysSince(threeDaysAgo)).toBeGreaterThan(2.9)
    expect(daysSince(threeDaysAgo)).toBeLessThan(3.1)
  })
})
