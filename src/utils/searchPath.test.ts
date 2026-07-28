import { describe, expect, it } from 'vitest'
import { planDictHitNormalSearch, shouldKeepLocalForAiTab } from './searchPath'

describe('planDictHitNormalSearch', () => {
  it('keeps L1 then combined for AI Lookup', () => {
    expect(planDictHitNormalSearch('ai')).toEqual({ kind: 'l1-then-combined' })
  })

  it('keeps L1 then combined for Pure Core (same pipeline as Lookup)', () => {
    expect(planDictHitNormalSearch('core')).toEqual({ kind: 'l1-then-combined' })
  })

  it('stays instant-only for Instant mode', () => {
    expect(planDictHitNormalSearch('instant')).toEqual({ kind: 'instant-only' })
  })
})

describe('shouldKeepLocalForAiTab', () => {
  it('keeps local when flipping to Lookup/Core with a dictionary word', () => {
    expect(shouldKeepLocalForAiTab('ai', 'local', true)).toBe(true)
    expect(shouldKeepLocalForAiTab('core', 'local', true)).toBe(true)
  })

  it('does not keep local without wordResult or when already ai-full', () => {
    expect(shouldKeepLocalForAiTab('ai', 'local', false)).toBe(false)
    expect(shouldKeepLocalForAiTab('ai', 'ai-full', true)).toBe(false)
    expect(shouldKeepLocalForAiTab('instant', 'local', true)).toBe(false)
  })
})
