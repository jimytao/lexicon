import { describe, expect, it } from 'vitest'
import {
  shouldShowPrepImageryModule,
  shouldShowResultAiChat,
} from './resultAiVisibility'

describe('shouldShowResultAiChat', () => {
  it('hides Chat on Instant (L1 only)', () => {
    expect(shouldShowResultAiChat('instant', 'idle')).toBe(false)
    expect(shouldShowResultAiChat('instant', 'success')).toBe(false)
  })

  it('shows Chat on AI Lookup only after success', () => {
    expect(shouldShowResultAiChat('ai', 'loading')).toBe(false)
    expect(shouldShowResultAiChat('ai', 'idle')).toBe(false)
    expect(shouldShowResultAiChat('ai', 'error')).toBe(false)
    expect(shouldShowResultAiChat('ai', 'success')).toBe(true)
  })

  it('does not apply to core via this helper (Core uses CoreCognitiveView)', () => {
    // ResultView is Instant/Lookup only; core mode on ResultView should also hide
    expect(shouldShowResultAiChat('core', 'success')).toBe(false)
  })
})

describe('shouldShowPrepImageryModule', () => {
  it('shows for Lookup when module on and preps detected', () => {
    expect(shouldShowPrepImageryModule({
      moduleEnabled: true,
      searchMode: 'ai',
      prepositions: ['UP', 'ON'],
    })).toBe(true)
  })

  it('hides when no prepositions (typical bare word)', () => {
    expect(shouldShowPrepImageryModule({
      moduleEnabled: true,
      searchMode: 'ai',
      prepositions: [],
    })).toBe(false)
  })

  it('hides on Instant and Pure Core (Core uses chunks, not prep imagery)', () => {
    expect(shouldShowPrepImageryModule({
      moduleEnabled: true,
      searchMode: 'instant',
      prepositions: ['IN'],
    })).toBe(false)
    expect(shouldShowPrepImageryModule({
      moduleEnabled: true,
      searchMode: 'core',
      prepositions: ['IN'],
    })).toBe(false)
  })

  it('hides when module disabled', () => {
    expect(shouldShowPrepImageryModule({
      moduleEnabled: false,
      searchMode: 'ai',
      prepositions: ['OUT'],
    })).toBe(false)
  })
})
