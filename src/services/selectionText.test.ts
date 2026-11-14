import { describe, expect, it } from 'vitest'
import { MAX_SELECTION_LENGTH, normalizeSelection } from './selectionText'

const sentence = 'The two Chinese vessels were engaged in a high-speed pursuit of the patrol boat. '

describe('normalizeSelection', () => {
  it('keeps a normal paragraph whole (the old 300-char cap cut it mid-word)', () => {
    const paragraph = (sentence.repeat(5) + 'The larger warship cut across and slammed into the side of the cutter.').trim()
    expect(paragraph.length).toBeGreaterThan(300)
    expect(normalizeSelection(paragraph)).toBe(paragraph)
  })

  it('collapses whitespace and trims', () => {
    expect(normalizeSelection('  run \n\n  into\tit  ')).toBe('run into it')
  })

  it('cuts an over-long selection at a sentence boundary', () => {
    const out = normalizeSelection(sentence.repeat(40))
    expect(out.length).toBeLessThanOrEqual(MAX_SELECTION_LENGTH)
    expect(out.endsWith('patrol boat.')).toBe(true)
  })

  it('falls back to a word boundary when there is no sentence end', () => {
    const out = normalizeSelection('word '.repeat(600), 100)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out.endsWith('word')).toBe(true)
  })

  it('hard-cuts only text without any spaces', () => {
    expect(normalizeSelection('字'.repeat(150), 100)).toHaveLength(100)
  })
})
