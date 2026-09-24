import { describe, expect, it } from 'vitest'
import { normalizeTextForTts, requireTtsText } from '../../../supabase/functions/_shared/ttsText'

describe('normalizeTextForTts', () => {
  it('removes pedagogical blanks without speaking underscores', () => {
    expect(normalizeTextForTts("Hello. I'm ____.")) .toBe("Hello. I'm.")
  })

  it('turns authoring separators into natural spaces', () => {
    expect(normalizeTextForTts('Can_I_have a coffee, please?')).toBe('Can I have a coffee, please?')
  })

  it('removes markdown while preserving readable text', () => {
    expect(normalizeTextForTts('**Good morning** — [listen](https://example.com).')).toBe('Good morning — listen.')
  })

  it('rejects content made only of placeholders', () => {
    expect(() => requireTtsText('____')).toThrow('empty after normalization')
  })
})
