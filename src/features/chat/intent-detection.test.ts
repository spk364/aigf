import { describe, it, expect } from 'vitest'
import { detectImageIntent, mentionsPhotoKeyword } from './intent-detection'

describe('detectImageIntent (hard tier — forces a paid photo)', () => {
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
    'show yourself',
    'gimme a pic',
    'send me your photo',
  ]
  it.each(en)('matches EN request: %s', (t) => {
    expect(detectImageIntent(t, 'en')).toBe(true)
  })

  const ru = [
    'отправь фото',
    'пришли селфи',
    'скинь фотку',
    'скинь мне фото',
    'скинь мне ещё фото',
    'хочу тебя увидеть',
    'можно фото?',
    'покажи себя',
    'покажись',
    'сфоткайся',
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
  ]
  it.each(es)('matches ES request: %s', (t) => {
    expect(detectImageIntent(t, 'es')).toBe(true)
  })

  const negatives: Array<[string, 'en' | 'ru' | 'es']> = [
    ['how are you today?', 'en'],
    ['tell me about your day', 'en'],
    ['как дела сегодня?', 'ru'],
    ['cuéntame de tu día', 'es'],
    // Casual imperatives / appearance questions must NOT force a charge —
    // these used to match and silently billed a photo.
    ['show me how to cook pasta', 'en'],
    ['what are you wearing', 'en'],
    ['покажи мне пример', 'ru'],
    ['покажи мне город', 'ru'],
    ['как ты выглядишь?', 'ru'],
    ['cómo te ves?', 'es'],
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

describe('mentionsPhotoKeyword (soft tier — confirms a model directive)', () => {
  const positives = [
    // Everything the hard tier matches…
    'send me a photo',
    'отправь фото',
    'mándame una foto',
    // …plus appearance questions and looser phrasings the hard tier now skips.
    'what are you wearing',
    'what do you look like?',
    'как ты выглядишь?',
    'во что ты одета?',
    'cómo te ves?',
    'show me',
    'покажи',
    'got any pics?',
    'есть фотки?',
  ]
  it.each(positives)('matches: %s', (t) => {
    expect(mentionsPhotoKeyword(t)).toBe(true)
  })

  // Reported: after a photo, a bare "fully naked" follow-up produced no photo
  // and no reply. Nudity/undress phrasing names no photo noun, so the soft gate
  // dropped the model's [SEND_PHOTO] on exactly the turn the user meant it.
  const nudityFollowUps = [
    'fully naked',
    'now take it off',
    'undress',
    'topless please',
    'голая',
    'разденься',
    'без белья',
    'desnuda',
    'quítate la ropa',
  ]
  it.each(nudityFollowUps)('matches nudity follow-up: %s', (t) => {
    expect(mentionsPhotoKeyword(t)).toBe(true)
  })

  it('still does not FORCE a paid photo on a bare nudity follow-up', () => {
    // Soft tier only — it takes a model-emitted [SEND_PHOTO] to actually send.
    expect(detectImageIntent('fully naked', 'en')).toBe(false)
  })

  const negatives = [
    'hi',
    'how are you today?',
    'i love you',
    'расскажи о себе',
    'что делаешь вечером?',
    'cuéntame de tu día',
  ]
  it.each(negatives)('does not match: %s', (t) => {
    expect(mentionsPhotoKeyword(t)).toBe(false)
  })
})
