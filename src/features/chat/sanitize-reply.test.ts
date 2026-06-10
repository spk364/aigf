import { describe, it, expect } from 'vitest'
import { stripActionAsterisks } from './sanitize-reply'

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
