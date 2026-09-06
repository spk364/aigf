import { describe, it, expect } from 'vitest'
import {
  makeReplyStreamFilter,
  sanitizeReplyText,
  stripActionAsterisks,
  stripBracketNarration,
  stripMetaCommentary,
} from './sanitize-reply'

describe('stripActionAsterisks', () => {
  it('removes a leading action span and tidies the gap', () => {
    expect(stripActionAsterisks('*smiles warmly* hey you')).toBe('hey you')
  })

  it('removes a trailing action span', () => {
    expect(stripActionAsterisks('I missed you *leans in*')).toBe('I missed you')
  })

  it('removes multiple spans and collapses the leftover whitespace', () => {
    expect(stripActionAsterisks('*waves* hi there *giggles* how are you')).toBe(
      'hi there how are you',
    )
  })

  it('drops a space stranded before punctuation', () => {
    expect(stripActionAsterisks('Oh *blushes* , you flatter me')).toBe('Oh, you flatter me')
  })

  it('strips double-asterisk emphasis too', () => {
    expect(stripActionAsterisks('that is **so** sweet')).toBe('that is sweet')
  })

  it('leaves a lone unmatched asterisk untouched', () => {
    expect(stripActionAsterisks('5 * 3 is fifteen')).toBe('5 * 3 is fifteen')
  })

  it('returns the text unchanged when there are no asterisks', () => {
    expect(stripActionAsterisks('just plain dialogue')).toBe('just plain dialogue')
  })

  it('keeps surrounding sentences when an action is mid-message', () => {
    expect(stripActionAsterisks('Come here *pulls you close* I want you near me')).toBe(
      'Come here I want you near me',
    )
  })

  it('does not let a stray asterisk swallow across newlines', () => {
    expect(stripActionAsterisks('first line *\nsecond line')).toBe('first line *\nsecond line')
  })
})

describe('stripBracketNarration', () => {
  it('removes a bracketed scene description', () => {
    expect(
      stripBracketNarration(
        'Fine. But if I see it circulating?\n\n[Photo: Jade sprawled across black silk sheets]\n\nRun along.',
      ),
    ).toBe('Fine. But if I see it circulating?\n\nRun along.')
  })

  it('removes an inline stage direction', () => {
    expect(stripBracketNarration('T-there... I did it [her thighs trembling] please tell me')).toBe(
      'T-there... I did it please tell me',
    )
  })

  it('removes a bracket left unterminated by the token limit', () => {
    expect(stripBracketNarration('Come closer. [she reaches for your')).toBe('Come closer.')
  })

  it('leaves bracket-free dialogue untouched', () => {
    expect(stripBracketNarration('just plain dialogue')).toBe('just plain dialogue')
  })
})

describe('stripMetaCommentary', () => {
  it('drops a planning paragraph and keeps the reply', () => {
    expect(
      stripMetaCommentary(
        'Okay, the user is asking for a selfie. I should stay in character and keep it flirty.\n\nOh, you are bold today. Give me a second.',
      ),
    ).toBe('Oh, you are bold today. Give me a second.')
  })

  it('drops a planning sentence that shares the paragraph with the reply', () => {
    expect(
      stripMetaCommentary('Okay, the user wants a photo. Привет, малыш! Только что вернулась.'),
    ).toBe('Привет, малыш! Только что вернулась.')
  })

  it('drops Russian planning commentary', () => {
    expect(
      stripMetaCommentary('Мне нужно ответить тепло и в образе.\n\nПривет, сладкий. Скучал?'),
    ).toBe('Привет, сладкий. Скучал?')
  })

  it('removes a <think> block', () => {
    expect(stripMetaCommentary('<think>plan the tease first</think>\nОй, ну ты и наглый…')).toBe(
      'Ой, ну ты и наглый…',
    )
  })

  it('removes an unterminated <think> block', () => {
    expect(stripMetaCommentary('Hey you.\n\n<think>should I send a photo')).toBe('Hey you.')
  })

  it('leaves ordinary dialogue untouched', () => {
    const text = 'I missed you. Come sit with me and tell me about your day.'
    expect(stripMetaCommentary(text)).toBe(text)
  })

  it('does not empty a reply that is only mildly meta-sounding', () => {
    const text = 'I should probably go soon. But I would rather stay here with you.'
    expect(stripMetaCommentary(text)).toBe(text)
  })
})

describe('sanitizeReplyText', () => {
  it('strips commentary, brackets and asterisks together', () => {
    expect(
      sanitizeReplyText(
        'Okay, the user asked for a pic. I should keep it short.\n\n*grins* Here you go, babe. [Photo: her on the balcony]',
      ),
    ).toBe('Here you go, babe.')
  })
})

describe('makeReplyStreamFilter', () => {
  const run = (chunks: string[]) => {
    const f = makeReplyStreamFilter()
    let out = ''
    for (const c of chunks) out += f.push(c)
    out += f.flush()
    return out
  }

  it('never emits a planning preamble', () => {
    expect(
      run(['Okay, the ', 'user wants a selfie. ', 'I should tease first.\n\n', 'Mmm, look at you.']),
    ).toBe('Mmm, look at you.')
  })

  it('resumes at the first clean sentence when there is no paragraph break', () => {
    expect(run(['Okay, the user ', 'wants a photo. ', 'Привет! ', 'Я скучала.'])).toBe(
      'Привет! Я скучала.',
    )
  })

  it('streams ordinary dialogue through once past the decision window', () => {
    const long = 'I have been thinking about you all afternoon and I could not focus on anything else at all.'
    expect(run([long])).toBe(long)
  })

  it('emits a short reply on flush', () => {
    expect(run(['Hey ', 'you.'])).toBe('Hey you.')
  })

  it('never shows a half-written bracket block', () => {
    const f = makeReplyStreamFilter()
    const first = f.push('Here you go, babe. That is enough teasing for one evening, I think.')
    const mid = f.push(' [Photo: her on')
    const end = f.push(' the balcony] Say something.')
    expect(mid).toBe('')
    // The gap the removed block leaves is only tidied by the final
    // sanitizeReplyText pass — the stream filter can't rewrite text the client
    // has already appended, which is what the end-of-stream `replace` is for.
    const streamed = first + mid + end + f.flush()
    expect(streamed).toBe(
      'Here you go, babe. That is enough teasing for one evening, I think.  Say something.',
    )
    expect(sanitizeReplyText(streamed)).toBe(
      'Here you go, babe. That is enough teasing for one evening, I think. Say something.',
    )
  })
})
