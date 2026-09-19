/**
 * v0.9.15 split combined request: the two halves (Lookup / Pure Core) now arrive
 * as independent parallel responses. These tests pin the parts that are easy to
 * get subtly wrong — partial results leaking into the cache, a late half from a
 * superseded query repainting the screen, and cross-word state bleed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const memoryStorage = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    key: (i) => [...map.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', storage)
  return storage
})

import { useResultStore } from './resultStore'
import type { QuerySkeleton } from './resultStore'
import type { AiFullResult } from '../types'

function fullResult(over: Partial<AiFullResult> = {}): AiFullResult {
  return {
    correctForm: 'run',
    phonetic: '/rʌn/',
    pos: 'verb',
    meanings: [{ senseIndex: 1, zh: '跑', en: 'to move fast on foot' }],
    examples: [],
    ...over,
  }
}

const skeleton: QuerySkeleton = {
  correctForm: 'run',
  pos: 'verb',
  senses: [{ senseIndex: 1, zh: '跑', en: 'run' }],
}

function freshStore() {
  memoryStorage.clear()
  useResultStore.setState({
    wordResult: null,
    aiAnalysis: null,
    aiFullResult: null,
    phraseResult: null,
    combinedResult: null,
    combinedPhraseResult: null,
    aiStatus: 'idle',
    aiError: null,
    aiPendingHalves: { lookup: false, core: false },
    aiFailedHalves: { lookup: false, core: false },
    aiIsPartial: false,
    aiSkeleton: null,
    aiCache: {},
    aiFullCache: {},
    phraseCache: {},
    combinedCache: {},
    combinedPhraseCache: {},
  })
  // reset() also clears the module-scoped draft accumulators
  useResultStore.getState().reset()
}

beforeEach(freshStore)

describe('partial results never masquerade as complete', () => {
  it('does not write combinedCache until BOTH halves land', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')

    s.commitCombinedHalf('run', 'lookup', fullResult(), 'normal')
    expect(useResultStore.getState().combinedCache['run::combined']).toBeUndefined()
    expect(useResultStore.getState().aiIsPartial).toBe(true)

    s.commitCombinedHalf('run', 'core', fullResult({ coreConcept: { image: 'x' } }), 'normal')
    expect(useResultStore.getState().combinedCache['run::combined']).toBeDefined()
    expect(useResultStore.getState().aiIsPartial).toBe(false)
  })

  it('still persists a lone half on its own so it survives a revisit', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf('run', 'lookup', fullResult(), 'normal')
    s.settleCombinedHalf('core')

    // getCachedCombined's legacy path reconstructs from aiFullCache.
    expect(useResultStore.getState().getCachedCombined('run', 'normal')).not.toBeNull()
  })

  it('a skeleton preview writes to no cache at all', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton('run', skeleton, 'word')

    const st = useResultStore.getState()
    expect(st.aiIsPartial).toBe(true)
    expect(st.combinedResult?.lookup.meanings[0].zh).toBe('跑')
    expect(Object.keys(st.combinedCache)).toHaveLength(0)
    expect(Object.keys(st.aiFullCache)).toHaveLength(0)
    expect(Object.keys(st.aiCache)).toHaveLength(0)
  })
})

describe('stale arrivals are rejected', () => {
  it('drops a half belonging to a superseded query', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.beginCombined('walk', 'normal', 'word') // user searched again

    s.commitCombinedHalf('run', 'lookup', fullResult({ correctForm: 'run' }), 'normal')

    const st = useResultStore.getState()
    expect(st.combinedResult).toBeNull()
    expect(st.combinedCache['run::combined']).toBeUndefined()
    expect(st.aiFullCache['run']).toBeUndefined()
  })

  it('drops a skeleton for a query we are no longer resolving', () => {
    const s = useResultStore.getState()
    s.beginCombined('walk', 'normal', 'word')
    s.applyQuerySkeleton('run', skeleton, 'word')
    expect(useResultStore.getState().combinedResult).toBeNull()
  })

  it('never lets a late skeleton downgrade a half that already landed', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf('run', 'lookup', fullResult({ etymology: { parts: [], story: 'real' } }), 'normal')
    s.applyQuerySkeleton('run', skeleton, 'word')

    expect(useResultStore.getState().combinedResult?.lookup.etymology?.story).toBe('real')
  })

  it('keeps bypass and normal results in separate slots', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'bypass', 'word')
    s.commitCombinedHalf('run', 'lookup', fullResult(), 'normal') // wrong tag
    expect(useResultStore.getState().combinedResult).toBeNull()

    s.commitCombinedHalf('run', 'lookup', fullResult(), 'bypass')
    expect(useResultStore.getState().combinedResult).not.toBeNull()
  })
})

describe('no cross-word bleed', () => {
  it('a new query does not inherit the previous word\'s analysis', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf('run', 'lookup', fullResult({ etymology: { parts: [], story: 'from Old English' } }), 'normal')
    s.commitCombinedHalf('run', 'core', fullResult(), 'normal')

    s.beginCombined('尴尬', 'normal', 'word')
    s.applyQuerySkeleton('尴尬', { correctForm: 'awkward', senses: [{ senseIndex: 1, zh: '尴尬', en: 'awkward' }] }, 'word')

    const st = useResultStore.getState()
    expect(st.aiFullResult?.correctForm).toBe('awkward')
    expect(st.aiFullResult?.etymology).toBeUndefined()
    // aiFullToAnalysis synthesizes an empty etymology shell; what matters is that
    // it carries no content from the previous word.
    expect(st.aiAnalysis?.etymology?.story ?? '').toBe('')
    // the earlier word's cache entry must survive untouched
    expect(st.combinedCache['run::combined']?.lookup.etymology?.story).toBe('from Old English')
  })
})

describe('pending flags drive the per-half shimmer', () => {
  it('clears only the half that settled', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: true })

    s.commitCombinedHalf('run', 'core', fullResult(), 'normal')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: false })
  })

  it('does not replace the lookup display with an empty shell when core lands first', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton('run', skeleton, 'word')

    s.commitCombinedHalf('run', 'core', fullResult({
      meanings: [],
      coreConcept: { image: 'forward motion' },
    }), 'normal')

    const partial = useResultStore.getState()
    expect(partial.aiPendingHalves).toEqual({ lookup: true, core: false })
    expect(partial.aiFullResult?.meanings[0]?.zh).toBe('跑')

    s.commitCombinedHalf('run', 'lookup', fullResult({
      meanings: [{
        senseIndex: 1,
        zh: '跑',
        en: 'to move fast on foot',
        scene: { label: '跑步', description: '向前快速移动' },
        imageQuery: 'person running outdoors',
      }],
    }), 'normal')

    const complete = useResultStore.getState()
    expect(complete.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(complete.aiAnalysis?.meanings[0]?.scene?.label).toBe('跑步')
    expect(complete.aiAnalysis?.meanings[0]?.imageQuery).toBe('person running outdoors')
  })

  it('tracks a failed half independently from a successful half', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf('run', 'core', fullResult(), 'normal')
    s.settleCombinedHalf('lookup')

    expect(useResultStore.getState().aiFailedHalves).toEqual({ lookup: true, core: false })
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: false, core: false })
  })

  it('an error clears both so nothing shimmers forever', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.setAiError('boom')

    const st = useResultStore.getState()
    expect(st.aiStatus).toBe('error')
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(st.aiIsPartial).toBe(false)
  })

  it('a cache hit is fully settled on arrival', () => {
    const s = useResultStore.getState()
    s.beginCombined('run', 'normal', 'word')
    s.setCombinedResult('run', { lookup: fullResult(), core: fullResult() }, 'normal')

    const st = useResultStore.getState()
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(st.aiIsPartial).toBe(false)
    expect(st.aiSkeleton).toBeNull()
  })
})

describe('updateMeaningExtension safety', () => {
  it('does not create sparse array holes when sense index exceeds existing aiAnalysis meanings', () => {
    const s = useResultStore.getState()
    s.setAiAnalysis('plane', {
      meanings: [
        { zh: '飞机', scene: { label: '飞行', description: '空中交通' } }
      ],
      etymology: { parts: [], story: '', derivedWords: [] },
      synonyms: [],
    })
    // Attempt to enrich index 5 (which does not exist in aiAnalysis.meanings)
    s.updateMeaningExtension('plane', 5, {
      scene: { label: '平面', description: '几何学概念' },
      imageQuery: 'geometric plane',
    })
    const st = useResultStore.getState()
    // Must NOT contain undefined holes in meanings
    expect(st.aiAnalysis?.meanings.some(m => !m)).toBe(false)
    expect(st.aiAnalysis?.meanings).toHaveLength(1)
  })

  it('sanitizes legacy sparse arrays on getCachedAi', () => {
    const s = useResultStore.getState()
    const corruptedMeanings: any = [{ zh: 'm0' }]
    corruptedMeanings[3] = { zh: 'm3' }
    s.setAiAnalysis('test', {
      meanings: corruptedMeanings,
      etymology: { parts: [], story: '', derivedWords: [] },
      synonyms: [],
    })
    const retrieved = s.getCachedAi('test')
    expect(retrieved?.meanings.some(m => !m)).toBe(false)
    expect(retrieved?.meanings).toHaveLength(2)
  })
})
