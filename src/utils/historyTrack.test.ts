import { describe, expect, it } from 'vitest'
import { historyModeForTrack, resolveHistoryTrack } from './historyTrack'

const emptyCaches = {
  aiCache: {} as Record<string, unknown>,
  aiFullCache: {} as Record<string, unknown>,
  phraseCache: {} as Record<string, unknown>,
}

describe('resolveHistoryTrack', () => {
  it('returns null when neither track has cache nor intent (Instant-only history)', () => {
    expect(resolveHistoryTrack('apple', {
      prefer: 'lookup',
      entry: { word: 'apple', lookupAiMode: null, coreAiMode: null },
      ...emptyCaches,
    })).toBeNull()
  })

  it('returns prefer when both tracks available', () => {
    expect(resolveHistoryTrack('run', {
      prefer: 'core',
      entry: { word: 'run', lookupAiMode: 'analyze', coreAiMode: 'full' },
      ...emptyCaches,
    })).toBe('core')

    expect(resolveHistoryTrack('run', {
      prefer: 'lookup',
      entry: { word: 'run', lookupAiMode: 'analyze', coreAiMode: 'full' },
      ...emptyCaches,
    })).toBe('lookup')
  })

  it('returns sole available track', () => {
    expect(resolveHistoryTrack('x', {
      prefer: 'lookup',
      entry: { word: 'x', lookupAiMode: null, coreAiMode: 'full' },
      ...emptyCaches,
    })).toBe('core')

    expect(resolveHistoryTrack('y', {
      prefer: 'core',
      entry: { word: 'y', lookupAiMode: 'analyze', coreAiMode: null },
      ...emptyCaches,
    })).toBe('lookup')
  })

  it('treats Lookup full cache key as lookup availability', () => {
    expect(resolveHistoryTrack('zeta', {
      prefer: 'core',
      entry: null,
      aiCache: {},
      aiFullCache: { zeta: { meanings: [] } },
      phraseCache: {},
    })).toBe('lookup')
  })

  it('treats q::core cache as core availability', () => {
    expect(resolveHistoryTrack('zeta', {
      prefer: 'lookup',
      entry: null,
      aiCache: {},
      aiFullCache: { 'zeta::core': { meanings: [] } },
      phraseCache: {},
    })).toBe('core')
  })
})

describe('historyModeForTrack', () => {
  it('maps null track to Instant for dictionary hits', () => {
    expect(historyModeForTrack(null, 'instant')).toBe('instant')
  })

  it('maps null track to preferred AI for OOD fallback', () => {
    expect(historyModeForTrack(null, 'ai')).toBe('ai')
    expect(historyModeForTrack(null, 'core')).toBe('core')
  })

  it('maps lookup→ai and core→core', () => {
    expect(historyModeForTrack('lookup', 'instant')).toBe('ai')
    expect(historyModeForTrack('core', 'instant')).toBe('core')
  })
})
