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
})
