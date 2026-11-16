import { describe, expect, it } from 'vitest'
import { escapeControlChars, escapeStrayQuotes, repairJsonText, stripTrailingCommas } from './lenientJson'

describe('escapeControlChars', () => {
  it('escapes a raw newline inside a string (DeepSeek Flash xenial sample)', () => {
    const raw = '{\n  "anchorNote": "xenial 则把“陌生人”转向“友好”。\n"\n}'
    expect(JSON.parse(escapeControlChars(raw))).toEqual({ anchorNote: 'xenial 则把“陌生人”转向“友好”。\n' })
  })

  it('escapes tabs and other control characters, keeps whitespace between tokens', () => {
    const raw = '{\n\t"a": "x\ty\u0001z"\n}'
    expect(JSON.parse(escapeControlChars(raw))).toEqual({ a: 'x\ty\u0001z' })
  })

  it('leaves valid JSON byte-for-byte intact', () => {
    const raw = '{\n  "a": "line\\nbreak \\"q\\"",\n  "b": [1, 2]\n}'
    expect(escapeControlChars(raw)).toBe(raw)
  })
})

describe('escapeStrayQuotes', () => {
  it('escapes bare quotes used as prose punctuation (DeepSeek Flash jovial sample)', () => {
    const raw = '{\n  "anchorNote": "jovial 本义就是"像木星/朱庇特影响下的人"。",\n  "pos": "adj"\n}'
    expect(JSON.parse(escapeStrayQuotes(raw))).toEqual({
      anchorNote: 'jovial 本义就是"像木星/朱庇特影响下的人"。',
      pos: 'adj',
    })
  })

  it('handles a bare quoted span at the very end of a value', () => {
    const raw = '{"note": "读作"欢乐的"", "x": 1}'
    expect(JSON.parse(escapeStrayQuotes(raw))).toEqual({ note: '读作"欢乐的"', x: 1 })
  })

  it('leaves valid JSON byte-for-byte intact', () => {
    const raw = '{"a": "say \\"hi\\"", "b": ["x", "y"], "c": {"d": true}}'
    expect(escapeStrayQuotes(raw)).toBe(raw)
  })
})

describe('stripTrailingCommas', () => {
  it('removes a trailing comma before a closing brace (DeepSeek Flash sample)', () => {
    const raw = '{\n  "scene": {\n    "description": "记者用这个词概括。",\n  },\n  "imageQuery": "athlete"\n}'
    expect(JSON.parse(stripTrailingCommas(raw))).toEqual({
      scene: { description: '记者用这个词概括。' },
      imageQuery: 'athlete',
    })
  })

  it('removes a trailing comma before a closing bracket', () => {
    expect(JSON.parse(stripTrailingCommas('[1, 2, 3 ,\n]'))).toEqual([1, 2, 3])
  })

  it('leaves commas inside strings alone, including escaped quotes', () => {
    const raw = '{"a": "x, }", "b": "say \\",]\\" ok",}'
    expect(JSON.parse(stripTrailingCommas(raw))).toEqual({ a: 'x, }', b: 'say ",]" ok' })
  })
})

describe('repairJsonText', () => {
  it('returns valid JSON unchanged', () => {
    const raw = '{"a": [1, 2], "b": "c,}"}'
    expect(repairJsonText(raw)).toBe(raw)
  })

  it('repairs trailing commas', () => {
    expect(JSON.parse(repairJsonText('{"a": [1,], "b": {"c": 1,},}'))).toEqual({ a: [1], b: { c: 1 } })
  })

  it('repairs stray quotes and trailing commas together', () => {
    const raw = '{"a": "就是"这个"意思",\n}'
    expect(JSON.parse(repairJsonText(raw))).toEqual({ a: '就是"这个"意思' })
  })

  it('returns the original text when the repair does not make it parse', () => {
    const raw = '{"a": 1,} trailing garbage {'
    expect(repairJsonText(raw)).toBe(raw)
  })
})
