/**
 * TDD: combinedResult utilities
 * These tests define the contract before implementation.
 */
import { describe, expect, it } from 'vitest'
import {
  combinedCacheKey,
  splitCombinedJson,
  reconstructFromLegacy,
  reconstructPhraseFromLegacy,
  isValidCombinedAiResult,
} from './combinedResult'
import type { AiFullResult, PhraseResult, CombinedAiResult } from '../types'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeFullResult(tag: string): AiFullResult {
  return {
    correctForm: tag,
    phonetic: '/tæg/',
    pos: 'noun',
    meanings: [{ zh: '测试', en: tag, pos: 'noun' }],
    examples: [],
  }
}

function makePhraseResult(tag: string): PhraseResult {
  return {
    phrase: tag,
    correctForm: tag,
    meaning: `meaning of ${tag}`,
    examples: [],
  }
}

// ── combinedCacheKey ─────────────────────────────────────────────────────────

describe('combinedCacheKey', () => {
  it('is mode-agnostic — same key regardless of lookup vs core', () => {
    expect(combinedCacheKey('run')).toBe('run::combined')
    expect(combinedCacheKey('RUN')).toBe('run::combined')
    expect(combinedCacheKey('  run  ')).toBe('run::combined')
  })

  it('works for multi-word phrases', () => {
    expect(combinedCacheKey('flat chat')).toBe('flat chat::combined')
  })

  it('is distinct from old cognitive cache keys', () => {
    const combined = combinedCacheKey('run')
    expect(combined).not.toBe('run')           // old lookup key
    expect(combined).not.toBe('run::core')     // old core key
  })
})

// ── splitCombinedJson ────────────────────────────────────────────────────────

describe('splitCombinedJson', () => {
  it('extracts lookup and core from a combined AI JSON response', () => {
    const raw = {
      lookup: makeFullResult('lookup-run'),
      core: makeFullResult('core-run'),
    }
    const result = splitCombinedJson(JSON.stringify(raw))
    expect(result.lookup.correctForm).toBe('lookup-run')
    expect(result.core.correctForm).toBe('core-run')
  })

  it('ensures lookup and core each have meanings arrays', () => {
    const raw = {
      lookup: { correctForm: 'run', phonetic: '/rʌn/', pos: 'verb' },
      core: { correctForm: 'run', phonetic: '/rʌn/', pos: 'verb' },
    }
    const result = splitCombinedJson(JSON.stringify(raw))
    expect(Array.isArray(result.lookup.meanings)).toBe(true)
    expect(Array.isArray(result.core.meanings)).toBe(true)
    expect(Array.isArray(result.lookup.examples)).toBe(true)
    expect(Array.isArray(result.core.examples)).toBe(true)
  })

  it('throws a descriptive error on malformed JSON', () => {
    expect(() => splitCombinedJson('not json')).toThrow()
  })

  it('throws if lookup or core key is missing', () => {
    expect(() => splitCombinedJson(JSON.stringify({ lookup: makeFullResult('x') }))).toThrow(
      /core/i
    )
    expect(() => splitCombinedJson(JSON.stringify({ core: makeFullResult('x') }))).toThrow(
      /lookup/i
    )
  })
})

// ── reconstructFromLegacy ────────────────────────────────────────────────────

describe('reconstructFromLegacy', () => {
  it('builds a CombinedAiResult from two legacy AiFullResult objects', () => {
    const lookup = makeFullResult('lookup-beautiful')
    const core = makeFullResult('core-beautiful')
    const combined = reconstructFromLegacy(lookup, core)
    expect(combined.lookup.correctForm).toBe('lookup-beautiful')
    expect(combined.core.correctForm).toBe('core-beautiful')
  })

  it('returns a valid CombinedAiResult structure', () => {
    const combined = reconstructFromLegacy(makeFullResult('a'), makeFullResult('b'))
    expect(isValidCombinedAiResult(combined)).toBe(true)
  })

  it('handles null core gracefully — mirrors lookup as core placeholder', () => {
    const lookup = makeFullResult('run')
    const combined = reconstructFromLegacy(lookup, null)
    expect(combined.lookup.correctForm).toBe('run')
    expect(combined.core.correctForm).toBe('run')
  })

  it('reconstructs CombinedPhraseResult from legacy PhraseResult', () => {
    const p = makePhraseResult('flat chat')
    const combined = reconstructPhraseFromLegacy(p, null)
    expect(combined.lookup.phrase).toBe('flat chat')
    expect(combined.core.phrase).toBe('flat chat')
  })
})

// ── isValidCombinedAiResult ──────────────────────────────────────────────────

describe('isValidCombinedAiResult', () => {
  it('returns true for a well-formed combined result', () => {
    const good: CombinedAiResult = {
      lookup: makeFullResult('x'),
      core: makeFullResult('x'),
    }
    expect(isValidCombinedAiResult(good)).toBe(true)
  })

  it('returns false for null/undefined', () => {
    expect(isValidCombinedAiResult(null)).toBe(false)
    expect(isValidCombinedAiResult(undefined)).toBe(false)
  })

  it('returns false if lookup or core is missing', () => {
    expect(isValidCombinedAiResult({ lookup: makeFullResult('x') } as any)).toBe(false)
    expect(isValidCombinedAiResult({ core: makeFullResult('x') } as any)).toBe(false)
  })
})
