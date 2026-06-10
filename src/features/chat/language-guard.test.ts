import { describe, it, expect } from 'vitest'
import {
  replyLanguageName,
  buildOutputGuard,
  detectMessageLanguage,
  resolveReplyLocale,
} from './language-guard'

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

describe('detectMessageLanguage', () => {
  it('detects Russian from Cyrillic script', () => {
    expect(detectMessageLanguage('привет, как дела?')).toBe('ru')
    expect(detectMessageLanguage('Hello мир')).toBe('ru')
  })
  it('detects Spanish from Spanish-only orthography', () => {
    expect(detectMessageLanguage('¿cómo estás?')).toBe('es')
    expect(detectMessageLanguage('mañana nos vemos')).toBe('es')
  })
  it('detects Spanish vs English from stopwords', () => {
    expect(detectMessageLanguage('hola que tal, te quiero')).toBe('es')
    expect(detectMessageLanguage('what are you doing today')).toBe('en')
  })
  it('returns null for ambiguous / too-short text', () => {
    expect(detectMessageLanguage('ok')).toBeNull()
    expect(detectMessageLanguage('😀')).toBeNull()
    expect(detectMessageLanguage('')).toBeNull()
    expect(detectMessageLanguage(null)).toBeNull()
  })
})

describe('resolveReplyLocale', () => {
  it('prefers the detected message language over the UI locale', () => {
    // UI in English, user typing Russian → reply in Russian.
    expect(resolveReplyLocale('привет', 'en')).toBe('ru')
    // UI in Russian, user typing English → reply in English.
    expect(resolveReplyLocale('what are you up to', 'ru')).toBe('en')
  })
  it('falls back to the UI locale when detection is ambiguous', () => {
    expect(resolveReplyLocale('ok', 'ru')).toBe('ru')
    expect(resolveReplyLocale('', 'es')).toBe('es')
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
