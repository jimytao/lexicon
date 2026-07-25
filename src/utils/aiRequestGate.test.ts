import { describe, expect, it } from 'vitest'
import { createAiRequestGate, shouldCommitAiDisplay } from './aiRequestGate'

describe('createAiRequestGate', () => {
  it('begin tokens become stale after cancel', () => {
    const gate = createAiRequestGate()
    const t1 = gate.begin()
    expect(gate.isCurrent(t1)).toBe(true)
    gate.cancel()
    expect(gate.isCurrent(t1)).toBe(false)
    const t2 = gate.begin()
    expect(gate.isCurrent(t2)).toBe(true)
    expect(gate.isCurrent(t1)).toBe(false)
  })

  it('newer begin invalidates older token (same as cancel for writes)', () => {
    const gate = createAiRequestGate()
    const t1 = gate.begin()
    const t2 = gate.begin()
    expect(gate.isCurrent(t1)).toBe(false)
    expect(gate.isCurrent(t2)).toBe(true)
  })
})

describe('shouldCommitAiDisplay', () => {
  it('blocks commit when Instant even if token is current', () => {
    const gate = createAiRequestGate()
    const token = gate.begin()
    expect(shouldCommitAiDisplay(token, gate, 'instant')).toBe(false)
  })

  it('allows commit for ai/core when token current', () => {
    const gate = createAiRequestGate()
    const token = gate.begin()
    expect(shouldCommitAiDisplay(token, gate, 'ai')).toBe(true)
    expect(shouldCommitAiDisplay(token, gate, 'core')).toBe(true)
  })

  it('blocks commit when cancelled even in ai mode', () => {
    const gate = createAiRequestGate()
    const token = gate.begin()
    gate.cancel()
    expect(shouldCommitAiDisplay(token, gate, 'ai')).toBe(false)
  })
})
