import { describe, expect, it } from 'vitest'
import type { UserLanguageProfile, WeaknessPattern } from '../types'
import { getNativeLanguage } from '../services/nativeLanguage'
import { applyDiagnosticResult, buildDiagnosticPrompts, type DiagnosticEvent } from './diagnostic'

const NOW = '2026-10-29T00:00:00.000Z'
const zh = getNativeLanguage('zh')

function ev(over: Partial<DiagnosticEvent>): DiagnosticEvent {
  return { id: over.id ?? Math.random().toString(36), type: 'lookup', wordOrContext: 'x', timestamp: NOW, learnerLanguage: 'zh', ...over }
}

function wk(over: Partial<WeaknessPattern>): WeaknessPattern {
  return {
    id: 'w', description: 'd', sourceTrigger: 's', track: 'syntax_thought', status: 'learning',
    occurrenceCount: 1, confidence: 0.2, lastExposedAt: NOW, learnerLanguage: 'zh', ...over,
  }
}

function profile(weaknessPatterns: WeaknessPattern[]): UserLanguageProfile {
  return { lastUpdated: NOW, totalDiagnosticsRun: 1, weaknessPatterns, recentExplorationFocus: [], recommendations: [] }
}

const mixedBatch: DiagnosticEvent[] = [
  ev({ type: 'sentence', learningDirection: 'out', wordOrContext: 'it fails charging', details: 'it fails to charge' }),
  ev({ type: 'lookup', learningDirection: 'in', wordOrContext: 'serendipity' }),
]

describe('buildDiagnosticPrompts', () => {
  it('groups a mixed batch under lane headings and tags who wrote each text', () => {
    const { user, lanes } = buildDiagnosticPrompts(mixedBatch, profile([]), zh)
    expect(lanes).toEqual(['in', 'out'])
    expect(user).toContain('### OUT LANE')
    expect(user).toContain('### IN LANE')
    expect(user).toContain('learner wrote <learner_original>it fails charging</learner_original>')
    expect(user).toContain('AI corrected to <ai_generated>it fails to charge</ai_generated>')
    expect(user).toContain('searched <external_material>serendipity</external_material>')
  })

  it('only sends the baseline of lanes that have new evidence', () => {
    const p = profile([
      wk({ id: 'o', description: 'OUT_BASELINE', learningDirection: 'out' }),
      wk({ id: 'i', description: 'IN_BASELINE', learningDirection: 'in' }),
    ])
    const { user, lanes } = buildDiagnosticPrompts([mixedBatch[0]!], p, zh)
    expect(lanes).toEqual(['out'])
    expect(user).toContain('OUT_BASELINE')
    expect(user).not.toContain('IN_BASELINE')
  })

  it('ignores events that carry no lane', () => {
    expect(buildDiagnosticPrompts([ev({ type: 'chat' })], profile([]), zh).lanes).toEqual([])
  })
})

describe('applyDiagnosticResult', () => {
  const args = (current: UserLanguageProfile, snapshot = mixedBatch) => ({ current, snapshot, targetLanguage: 'zh' as const, nowIso: NOW })

  it('stamps the lane from the key an item came back under, ignoring the AI\'s own label', () => {
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [wk({ id: 'n1', learningDirection: 'in' })] },
      in: { weaknessPatterns: [], recentExplorationFocus: [{ category: 'rare_words', searchedItems: ['serendipity'], learningDirection: 'out' }] },
    }, args(profile([])))!
    expect(result.weaknessPatterns).toEqual([expect.objectContaining({ id: 'n1', learningDirection: 'out', learnerLanguage: 'zh' })])
    expect(result.recentExplorationFocus).toEqual([expect.objectContaining({ category: 'rare_words', learningDirection: 'in' })])
  })

  it('leaves a lane with no new evidence untouched even if the AI rewrote it', () => {
    const keep = wk({ id: 'keep', description: 'IN_UNTOUCHED', learningDirection: 'in' })
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [] },
      in: { weaknessPatterns: [] },
    }, args(profile([keep]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns).toEqual([keep])
  })

  it('keeps a lane as it was when the AI omitted its key', () => {
    const keep = wk({ id: 'keep-in', learningDirection: 'in' })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [] } }, args(profile([keep])))!
    expect(result.weaknessPatterns).toEqual([keep])
  })

  it('accepts a flat answer only when the batch had a single lane', () => {
    const flat = { weaknessPatterns: [wk({ id: 'flat' })] }
    expect(applyDiagnosticResult(flat, args(profile([])))).toBeNull()
    const single = applyDiagnosticResult(flat, args(profile([]), [mixedBatch[0]!]))!
    expect(single.weaknessPatterns).toEqual([expect.objectContaining({ id: 'flat', learningDirection: 'out' })])
  })

  it('refuses a confidence raise or "mastered" backed by the AI\'s own correction', () => {
    const prior = wk({ id: 'fail-ing', learningDirection: 'out', confidence: 0.2 })
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [{ ...prior, confidence: 0.8, status: 'mastered', improvementQuote: 'fails to charge' }] },
    }, args(profile([prior]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns[0]).toMatchObject({ id: 'fail-ing', confidence: 0.2, status: 'learning' })
    expect(result.weaknessPatterns[0]).not.toHaveProperty('improvementQuote')
  })

  it('accepts a raise backed by learner words that survived correction', () => {
    const prior = wk({ id: 'fail-to', learningDirection: 'out', confidence: 0.2 })
    const batch = [ev({ type: 'sentence', learningDirection: 'out', wordOrContext: 'It failed to start, and I was mad', details: 'It failed to start, and I was angry' })]
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [{ ...prior, confidence: 0.6, improvementQuote: 'failed to start' }] },
    }, args(profile([prior]), batch))!
    expect(result.weaknessPatterns[0]).toMatchObject({ confidence: 0.6 })
  })

  it('still lets confidence drop without any quote', () => {
    const prior = wk({ id: 'p', learningDirection: 'out', confidence: 0.5 })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [{ ...prior, confidence: 0.1 }] } }, args(profile([prior]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns[0]).toMatchObject({ confidence: 0.1 })
  })

  it('keeps legacy and other-language records out of the merge', () => {
    const legacy = wk({ id: 'legacy', learningDirection: undefined })
    const vi = wk({ id: 'vi', learningDirection: 'out', learnerLanguage: 'vi' })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [] }, in: { weaknessPatterns: [] } }, args(profile([legacy, vi])))!
    expect(result.weaknessPatterns).toEqual([legacy, vi])
  })

  it('returns null for an unusable answer so the events stay queued', () => {
    expect(applyDiagnosticResult(null, args(profile([])))).toBeNull()
    expect(applyDiagnosticResult('nope', args(profile([])))).toBeNull()
  })
})
