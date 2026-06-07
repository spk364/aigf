import { describe, it, expect } from 'vitest'
import { detectImageIntent } from './intent-detection'

describe('detectImageIntent', () => {
  const en = [
    'send me a photo',
    'send a pic',
    'show me a selfie',
    'can I see you?',
    'could I see a pic',
    'i want to see you',
    'i wanna see you',
    'send me a selfie',
    'photo of you please',
    'what are you wearing',
    'show yourself',
    'gimme a pic',
  ]
  it.each(en)('matches EN request: %s', (t) => {
    expect(detectImageIntent(t, 'en')).toBe(true)
  })

  const ru = [
    'отправь фото',
    'пришли селфи',
    'скинь фотку',
    'скинь мне фото',
    'хочу тебя увидеть',
    'можно фото?',
    'покажи себя',
    'покажись',
    'сфоткайся',
    'как ты выглядишь?',
  ]
  it.each(ru)('matches RU request: %s', (t) => {
    expect(detectImageIntent(t, 'ru')).toBe(true)
  })

  const es = [
    'mándame una foto',
    'envíame una selfie',
    'enséñame una foto',
    'quiero verte',
    'puedo verte?',
    'muéstrate',
    'cómo te ves?',
  ]
  it.each(es)('matches ES request: %s', (t) => {
    expect(detectImageIntent(t, 'es')).toBe(true)
  })

  const negatives: Array<[string, 'en' | 'ru' | 'es']> = [
    ['how are you today?', 'en'],
    ['tell me about your day', 'en'],
    ['как дела сегодня?', 'ru'],
    ['cuéntame de tu día', 'es'],
  ]
  it.each(negatives)('does not match non-request: %s', (t, locale) => {
    expect(detectImageIntent(t, locale)).toBe(false)
  })

  it('falls back to EN pattern for unknown locale', () => {
    expect(detectImageIntent('send me a photo', 'de')).toBe(true)
    expect(detectImageIntent('how are you', 'de')).toBe(false)
  })

  it('detects a request regardless of the thread locale (cross-language)', () => {
    // The reported bug: an English request in a Russian thread was missed, so
    // the photo was never forced and the model declined.
    expect(
      detectImageIntent('Send me a photo of you lying on the bed, in lingerie', 'ru'),
    ).toBe(true)
    expect(detectImageIntent('отправь фото', 'en')).toBe(true)
    expect(detectImageIntent('mándame una foto', 'ru')).toBe(true)
    // A non-request stays false no matter the locale.
    expect(detectImageIntent('how are you today?', 'ru')).toBe(false)
  })
})
