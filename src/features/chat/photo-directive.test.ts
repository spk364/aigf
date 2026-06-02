import { describe, it, expect } from 'vitest'
import {
  parsePhotoDirective,
  makeDirectiveStreamFilter,
} from './photo-directive'

describe('parsePhotoDirective', () => {
  it('detects a bare directive and removes it', () => {
    const r = parsePhotoDirective('Of course babe 😘 [SEND_PHOTO] hope you like it')
    expect(r.requested).toBe(true)
    expect(r.scene).toBeUndefined()
    expect(r.cleaned).toBe('Of course babe 😘 hope you like it')
  })

  it('extracts the scene description', () => {
    const r = parsePhotoDirective('here you go [SEND_PHOTO: red dress, on the bed, smiling]')
    expect(r.requested).toBe(true)
    expect(r.scene).toBe('red dress, on the bed, smiling')
    expect(r.cleaned).toBe('here you go')
  })

  it('is case-insensitive', () => {
    const r = parsePhotoDirective('look [send_photo: beach bikini] 💋')
    expect(r.requested).toBe(true)
    expect(r.scene).toBe('beach bikini')
    expect(r.cleaned).toBe('look 💋')
  })

  it('returns requested=false when no directive is present', () => {
    const r = parsePhotoDirective('Just chatting, no photo here.')
    expect(r.requested).toBe(false)
    expect(r.scene).toBeUndefined()
    expect(r.cleaned).toBe('Just chatting, no photo here.')
  })

  it('tidies whitespace left by a removed directive', () => {
    const r = parsePhotoDirective('hey\n\n[SEND_PHOTO]\n\nmiss you')
    expect(r.cleaned).toBe('hey\n\nmiss you')
  })

  it('leaves unrelated brackets untouched', () => {
    const r = parsePhotoDirective('*[smiles softly]* hi there')
    expect(r.requested).toBe(false)
    expect(r.cleaned).toBe('*[smiles softly]* hi there')
  })
})

describe('makeDirectiveStreamFilter', () => {
  // Drive a filter with a list of chunks; return the concatenated emitted text.
  function run(chunks: string[]): { emitted: string; cleaned: string; requested: boolean } {
    const f = makeDirectiveStreamFilter()
    let emitted = ''
    for (const c of chunks) emitted += f.push(c)
    const final = f.finish()
    return { emitted, cleaned: final.cleaned, requested: final.requested }
  }

  it('never emits the marker, even split across chunks', () => {
    const { emitted, requested } = run([
      'Of course ',
      'babe ',
      '[SE',
      'ND_PH',
      'OTO]',
      ' enjoy',
    ])
    expect(requested).toBe(true)
    expect(emitted).not.toContain('SEND_PHOTO')
    expect(emitted).not.toContain('[')
    expect(emitted.replace(/\s+/g, ' ').trim()).toBe('Of course babe enjoy')
  })

  it('never emits a directive with a scene split across chunks', () => {
    const { emitted } = run([
      'here ',
      '[SEND_PHOTO',
      ': red dress',
      ', on the bed]',
      ' hope u like',
    ])
    expect(emitted).not.toContain('SEND_PHOTO')
    expect(emitted).not.toContain('red dress')
    expect(emitted.replace(/\s+/g, ' ').trim()).toBe('here hope u like')
  })

  it('streams a normal reply unchanged', () => {
    const { emitted, requested } = run(['Hey, ', 'how ', 'are ', 'you?'])
    expect(requested).toBe(false)
    expect(emitted).toBe('Hey, how are you?')
  })

  it('does not hold back unrelated brackets', () => {
    const { emitted } = run(['*[winks]* ', 'come here'])
    expect(emitted).toContain('*[winks]*')
    expect(emitted).toContain('come here')
  })

  it('emits the leading text immediately when the directive is at the end', () => {
    const f = makeDirectiveStreamFilter()
    const first = f.push('You look amazing tonight ')
    expect(first).toBe('You look amazing tonight ')
    // Directive arrives — nothing new should be emitted for it.
    const second = f.push('[SEND_PHOTO]')
    expect(second).toBe('')
  })
})
