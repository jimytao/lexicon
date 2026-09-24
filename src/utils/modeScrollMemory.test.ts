import { describe, expect, it } from 'vitest'
import {
  getModeScrollPosition,
  saveModeScrollPosition,
} from './modeScrollMemory'

describe('lookup mode scroll memory', () => {
  it('starts an unseen mode at the top', () => {
    expect(getModeScrollPosition({}, 'core', 1200)).toBe(0)
  })

  it('keeps an independent reading position for each mode', () => {
    const instantSaved = saveModeScrollPosition({}, 'instant', 180)
    const allSaved = saveModeScrollPosition(instantSaved, 'ai', 760)

    expect(getModeScrollPosition(allSaved, 'instant', 1200)).toBe(180)
    expect(getModeScrollPosition(allSaved, 'ai', 1200)).toBe(760)
    expect(getModeScrollPosition(allSaved, 'core', 1200)).toBe(0)
  })

  it('clamps restored positions to the current page height', () => {
    const positions = saveModeScrollPosition({}, 'core', 900)

    expect(getModeScrollPosition(positions, 'core', 420)).toBe(420)
  })

  it('never stores or restores a negative position', () => {
    const positions = saveModeScrollPosition({}, 'ai', -50)

    expect(getModeScrollPosition(positions, 'ai', 500)).toBe(0)
  })
})
