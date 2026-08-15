import { describe, it, expect } from 'vitest'
import { singleLineHeight, wrapsToMultipleLines } from './composerAutoGrow'

describe('singleLineHeight', () => {
  it('adds vertical padding to the line height', () => {
    expect(singleLineHeight(24, 4, 4)).toBe(32)
  })

  it('falls back to 24 when line-height is not a usable number', () => {
    // getComputedStyle reports `normal` for Tailwind's leading-normal, and
    // parseFloat turns that into NaN
    expect(singleLineHeight(NaN, 8, 8)).toBe(40)
  })
})

describe('wrapsToMultipleLines', () => {
  it('treats an exact single line as single line', () => {
    expect(wrapsToMultipleLines(32, 32)).toBe(false)
  })

  it('tolerates sub-pixel rounding above one line', () => {
    expect(wrapsToMultipleLines(32.6, 32)).toBe(false)
  })

  it('detects a genuine second line', () => {
    expect(wrapsToMultipleLines(56, 32)).toBe(true)
  })
})
