import { describe, expect, it } from 'vitest'
// The converter is intentionally a directly executable Node ESM script.
// @ts-expect-error no declaration file is needed for this build-only utility.
import { parseSpdictEntry } from '../../scripts/mdx-en-vi-to-sqlite.mjs'

describe('SPDict parser', () => {
  it('extracts phonetic, parts of speech, meanings, and bilingual examples', () => {
    const entry = parseSpdictEntry('hello', `/hə'lou/ * thán từ - chào anh!, chào chị! =hello there+xin chào bạn * danh từ - tiếng chào\0`)
    expect(entry.phonetic).toBe(`/hə'lou/`)
    expect(entry.meanings).toEqual(expect.arrayContaining([
      expect.objectContaining({ zh: 'chào anh!, chào chị!', pos: 'interjection' }),
      expect.objectContaining({ zh: 'tiếng chào', pos: 'noun' }),
    ]))
    expect(entry.examples).toContainEqual({ en: 'hello there', zh: 'xin chào bạn' })
  })

  it('does not invent an entry when the source has no usable Vietnamese gloss', () => {
    expect(parseSpdictEntry('empty', '/x/ * unknown marker').meanings).toEqual([])
  })
  it('inherits POS across a separately starred domain/gloss block without turning a plural header into a sense', () => {
    const e = parseSpdictEntry('zygoma', "/zai'goumə/ * danh từ, số nhiều zygomata * (giải phẫu) xương gò má")
    expect(e.meanings).toEqual([{ zh: '(giải phẫu) xương gò má', en: '', pos: 'noun' }])
  })
  it('removes only the plural header and retains the following definitions', () => {
    const e = parseSpdictEntry('abacus', '* danh từ, số nhiều abaci, abacuses - bàn tính - (kiến trúc) đầu cột, đỉnh cột')
    expect(e.meanings).toHaveLength(2)
    expect(e.meanings[0]).toMatchObject({ zh: 'bàn tính', pos: 'noun' })
  })
  it('preserves synonym content after a combined POS header under both parts of speech', () => {
    const e = parseSpdictEntry('harbor', '* danh từ & động từ * (từ Mỹ,nghĩa Mỹ) (như) habour')
    expect(e.meanings).toEqual(expect.arrayContaining([
      { zh: '(từ Mỹ,nghĩa Mỹ) (như) habour', en: '', pos: 'noun' },
      { zh: '(từ Mỹ,nghĩa Mỹ) (như) habour', en: '', pos: 'verb' },
    ]))
  })
})
