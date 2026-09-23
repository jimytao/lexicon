import { describe, expect, it } from 'vitest'
import { calculateImageReadingStartScrollTop } from './imageReadingScroll'

describe('image translation reading start', () => {
  it('pins the image below the safe area without scrolling the translation list under it', () => {
    expect(calculateImageReadingStartScrollTop(720, 44)).toBe(676)
  })

  it('never requests a negative scroll position', () => {
    expect(calculateImageReadingStartScrollTop(20, 44)).toBe(0)
  })
})
