import { describe, expect, it } from 'vitest'
import type { UserLanguageProfile, WeaknessPattern } from '../types'
import { getNativeLanguage } from '../services/nativeLanguage'
import { applyDiagnosticResult, buildDiagnosticPrompts, selectDiagnosticSnapshot, type DiagnosticEvent } from './diagnostic'

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
  it('keeps budget-excluded events outside the consumed snapshot', () => {
    const events = Array.from({ length: 45 }, (_, i) => ev({ id: String(i), learningDirection: 'in' }))
    const selected = selectDiagnosticSnapshot(events)
    expect(selected).toHaveLength(40)
    expect(selected[0]?.id).toBe('0')
    expect(selected[39]?.id).toBe('39')
  })
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

  it('keeps app-owned production evidence out of the baseline sent to the AI', () => {
    const p = profile([wk({ id: 'o', learningDirection: 'out', verifiedProductionIds: ['ev1'], verifiedProductionTexts: ['the update failed to install'] })])
    const { user } = buildDiagnosticPrompts([mixedBatch[0]!], p, zh)
    expect(user).toContain('"id": "o"')
    expect(user).not.toContain('verifiedProduction')
    expect(user).not.toContain('the update failed to install')
  })

  it('ignores events that carry no lane', () => {
    expect(buildDiagnosticPrompts([ev({ type: 'chat' })], profile([]), zh).lanes).toEqual([])
  })
  it('does not promote an arbitrary history token into an authoritative lexical fact', () => {
    const prompts = buildDiagnosticPrompts([ev({ learningDirection: 'in', wordOrContext: 'abatibay' })], profile([]), zh)
    expect(prompts.system).toContain('A search string is not an authoritative word or definition')
  })
})

describe('applyDiagnosticResult', () => {
  const args = (current: UserLanguageProfile, snapshot = mixedBatch) => ({ current, snapshot, targetLanguage: 'zh' as const, nowIso: NOW })

  it('stamps the lane from the key an item came back under, ignoring the AI\'s own label', () => {
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [wk({ id: 'n1', learningDirection: 'in' })], recentExplorationFocus: [], recommendations: [] },
      in: { weaknessPatterns: [], recentExplorationFocus: [{ category: 'rare_words', searchedItems: ['serendipity'], learningDirection: 'out' }], recommendations: [] },
    }, args(profile([])))!
    expect(result.weaknessPatterns).toEqual([expect.objectContaining({ id: 'n1', learningDirection: 'out', learnerLanguage: 'zh' })])
    expect(result.recentExplorationFocus).toEqual([expect.objectContaining({ category: 'rare_words', learningDirection: 'in' })])
  })

  it('leaves a lane with no new evidence untouched even if the AI rewrote it', () => {
    const keep = wk({ id: 'keep', description: 'IN_UNTOUCHED', learningDirection: 'in' })
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [], recentExplorationFocus: [], recommendations: [] },
      in: { weaknessPatterns: [], recentExplorationFocus: [], recommendations: [] },
    }, args(profile([keep]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns).toEqual([keep])
  })

  it('rejects an omitted lane so its new events remain queued', () => {
    const keep = wk({ id: 'keep-in', learningDirection: 'in' })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [], recentExplorationFocus: [], recommendations: [] } }, args(profile([keep])))
    expect(result).toBeNull()
  })

  it('accepts a flat answer only when the batch had a single lane', () => {
    const flat = { weaknessPatterns: [wk({ id: 'flat' })], recentExplorationFocus: [], recommendations: [] }
    expect(applyDiagnosticResult(flat, args(profile([])))).toBeNull()
    const single = applyDiagnosticResult(flat, args(profile([]), [mixedBatch[0]!]))!
    expect(single.weaknessPatterns).toEqual([expect.objectContaining({ id: 'flat', learningDirection: 'out' })])
  })

  it('refuses a confidence raise or "mastered" backed by the AI\'s own correction', () => {
    const prior = wk({ id: 'fail-ing', learningDirection: 'out', confidence: 0.2 })
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [{ ...prior, confidence: 0.8, status: 'mastered', improvementQuote: 'fails to charge', improvementEventId: mixedBatch[0]!.id }], recentExplorationFocus: [], recommendations: [] },
    }, args(profile([prior]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns[0]).toMatchObject({ id: 'fail-ing', confidence: 0.2, status: 'learning' })
    expect(result.weaknessPatterns[0]).not.toHaveProperty('improvementQuote')
  })

  it('accepts a raise backed by learner words that survived correction', () => {
    const prior = wk({ id: 'fail-to', learningDirection: 'out', confidence: 0.2 })
    const batch = [ev({ type: 'sentence', learningDirection: 'out', wordOrContext: 'It failed to start, and I was mad', details: 'It failed to start, and I was angry' })]
    const result = applyDiagnosticResult({
      out: { weaknessPatterns: [{ ...prior, confidence: 0.6, improvementQuote: 'failed to start', improvementEventId: batch[0]!.id }], recentExplorationFocus: [], recommendations: [] },
    }, args(profile([prior]), batch))!
    expect(result.weaknessPatterns[0]).toMatchObject({ confidence: 0.6 })
  })

  it('still lets confidence drop without any quote', () => {
    const prior = wk({ id: 'p', learningDirection: 'out', confidence: 0.5 })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [{ ...prior, confidence: 0.1 }], recentExplorationFocus: [], recommendations: [] } }, args(profile([prior]), [mixedBatch[0]!]))!
    expect(result.weaknessPatterns[0]).toMatchObject({ confidence: 0.1 })
  })

  it('keeps legacy and other-language records out of the merge', () => {
    const legacy = wk({ id: 'legacy', learningDirection: undefined })
    const vi = wk({ id: 'vi', learningDirection: 'out', learnerLanguage: 'vi' })
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [], recentExplorationFocus: [], recommendations: [] }, in: { weaknessPatterns: [], recentExplorationFocus: [], recommendations: [] } }, args(profile([legacy, vi])))!
    expect(result.weaknessPatterns).toEqual([legacy, vi])
  })

  it('returns null for an unusable answer so the events stay queued', () => {
    expect(applyDiagnosticResult(null, args(profile([])))).toBeNull()
    expect(applyDiagnosticResult('nope', args(profile([])))).toBeNull()
  })
  it.each([{ out: {} }, { out: { weaknessPatterns: 'invalid' } }, { out: { weaknessPatterns: [{}], recentExplorationFocus: [], recommendations: [] } }])('rejects invalid sections: %j', parsed => {
    expect(applyDiagnosticResult(parsed, args(profile([]), [mixedBatch[0]!]))).toBeNull()
  })
  it('never accepts a correction quoted inside a learner question as production evidence', () => {
    const prior = wk({ learningDirection: 'out' })
    const batch = [ev({ id: 'q', type: 'chat', learningDirection: 'out', userQuestion: '为什么这里用 fails to charge？这是你改的。' })]
    const result = applyDiagnosticResult({ out: { weaknessPatterns: [{ ...prior, confidence: 0.9, status: 'mastered', improvementQuote: 'fails to charge', improvementEventId: 'q' }], recentExplorationFocus: [], recommendations: [] } }, args(profile([prior]), batch))!
    expect(result.weaknessPatterns[0]).toMatchObject({ confidence: 0.2, status: 'learning' })
    const prompts = buildDiagnosticPrompts(batch, profile([]), zh)
    expect(prompts.user).toContain('<learner_question>')
    expect(prompts.user).toContain('[eventId=q]')
  })
  it('binds progress to the event, and requires another independent example for mastery', () => {
    const prior = wk({ learningDirection: 'out' })
    const batch = [ev({ id: 'correct1', type: 'sentence', learningDirection: 'out', wordOrContext: 'It failed to start, and I felt angrily', details: 'It failed to start, and I felt angry' })]
    const parsed = { out: { weaknessPatterns: [{ ...prior, confidence: 0.8, status: 'mastered', improvementQuote: 'failed to start', improvementEventId: 'correct1', verifiedProductionIds: ['forged'] }], recentExplorationFocus: [], recommendations: [] } }
    const first = applyDiagnosticResult(parsed, args(profile([prior]), batch))!
    expect(first.weaknessPatterns[0]).toMatchObject({ confidence: 0.8, status: 'learning', verifiedProductionIds: ['correct1'] })
    const second = applyDiagnosticResult(parsed, args(profile([{ ...prior, verifiedProductionIds: ['earlier'], verifiedProductionTexts: ['a different independent sentence'] }]), batch))!
    expect(second.weaknessPatterns[0]).toMatchObject({ status: 'mastered', verifiedProductionIds: ['earlier', 'correct1'] })
    parsed.out.weaknessPatterns[0]!.improvementEventId = 'wrong'
    expect(applyDiagnosticResult(parsed, args(profile([prior]), batch))!.weaknessPatterns[0]?.confidence).toBe(0.2)
  })
})
