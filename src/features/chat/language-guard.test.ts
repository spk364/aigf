import { describe, it, expect } from 'vitest'
import { replyLanguageName, buildOutputGuard } from './language-guard'

describe('replyLanguageName', () => {
  it('maps known locales to language names', () => {
    expect(replyLanguageName('en')).toBe('English')
    expect(replyLanguageName('ru')).toBe('Russian')
    expect(replyLanguageName('es')).toBe('Spanish')
  })
  it('defaults to English for unknown / empty', () => {
    expect(replyLanguageName('de')).toBe('English')
    expect(replyLanguageName(null)).toBe('English')
    expect(replyLanguageName(undefined)).toBe('English')
  })
})

describe('buildOutputGuard', () => {
  it('names the user language explicitly', () => {
    const ru = buildOutputGuard('ru')
    expect(ru).toMatch(/Write your ENTIRE reply in Russian/)
    expect(ru).toMatch(/never in another language/i)
    // still carries the stay-in-character rule
    expect(ru).toMatch(/Stay fully in character/i)
  })
  it('falls back to English for unknown locale', () => {
    expect(buildOutputGuard('xx')).toMatch(/Write your ENTIRE reply in English/)
  })
})
