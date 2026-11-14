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

describe('cached insight validation revision', () => {
  it('keeps old analysis while hiding an unchecked legacy tip', () => {
    const old = fullResult({ profileInsight: '你已掌握', profileInsightDirection: 'out' })
    useResultStore.setState({ aiFullCache: { run: old } })
    const cached = useResultStore.getState().getCachedAiFull('run')
    expect(cached?.meanings).toEqual(old.meanings)
    expect(cached?.profileInsight).toBeUndefined()
  })
  it('preserves a tip verified by the current evidence gate', () => {
    const checked = fullResult({ profileInsight: 'A useful connection.', profileInsightDirection: 'in', profileInsightVersion: 4 })
    useResultStore.setState({ aiFullCache: { run: checked } })
    expect(useResultStore.getState().getCachedAiFull('run')?.profileInsight).toBe(checked.profileInsight)
  })
})

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
    aiHalfErrors: { lookup: null, core: null },
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
    const id = s.beginCombined('run', 'normal', 'word')

    s.commitCombinedHalf(id, 'lookup', fullResult())
    expect(useResultStore.getState().combinedCache['run::combined']).toBeUndefined()
    expect(useResultStore.getState().aiIsPartial).toBe(true)

    s.commitCombinedHalf(id, 'core', fullResult({ coreConcept: { image: 'x' } }))
    expect(useResultStore.getState().combinedCache['run::combined']).toBeDefined()
    expect(useResultStore.getState().aiIsPartial).toBe(false)
  })

  it('still persists a lone half on its own so it survives a revisit', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(id, 'lookup', fullResult())
    s.settleCombinedHalf(id, 'core')
    s.endCombined(id)

    // getCachedCombined's legacy path reconstructs from aiFullCache.
    expect(useResultStore.getState().getCachedCombined('run', 'normal')).not.toBeNull()
  })

  it('does not pass off the first half of a running request as a cached result', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(id, 'lookup', fullResult())

    // A tab flip mid-request used to get this lone half back as a "complete" result.
    expect(s.getCachedCombined('run', 'normal')).toBeNull()
    s.endCombined(id)
    expect(s.getCachedCombined('run', 'normal')).not.toBeNull()
  })

  it('a skeleton preview writes to no cache at all', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton(id, skeleton)

    const st = useResultStore.getState()
    expect(st.aiIsPartial).toBe(true)
    expect(st.combinedResult?.lookup.meanings[0].zh).toBe('跑')
    expect(Object.keys(st.combinedCache)).toHaveLength(0)
    expect(Object.keys(st.aiFullCache)).toHaveLength(0)
    expect(Object.keys(st.aiCache)).toHaveLength(0)
  })
})

describe('request tags: a request only ever writes into its own slot', () => {
  it('a superseded request cannot mark the new query as failed (the collision bug)', () => {
    const s = useResultStore.getState()
    const a = s.beginCombined('run', 'normal', 'word')
    s.setWordResult(null) // user searches another word
    const b = s.beginCombined('walk', 'normal', 'word')

    // run's request comes back with an error while walk is still loading
    s.settleCombinedHalf(a, 'lookup', 'AI API error 503')

    const st = useResultStore.getState()
    expect(st.aiFailedHalves).toEqual({ lookup: false, core: false })
    expect(st.aiPendingHalves).toEqual({ lookup: true, core: true })
    expect(st.aiHalfErrors.lookup).toBeNull()

    s.commitCombinedHalf(b, 'lookup', fullResult({ correctForm: 'walk' }))
    expect(useResultStore.getState().aiFullResult?.correctForm).toBe('walk')
  })

  it('a retry supersedes the old request of the same query', () => {
    const s = useResultStore.getState()
    const first = s.beginCombined('run', 'normal', 'word')
    const retry = s.beginCombined('run', 'normal', 'word')
    expect(retry).not.toBe(first)

    s.settleCombinedHalf(first, 'lookup', 'late failure from the old request')
    s.commitCombinedHalf(first, 'core', fullResult({ correctForm: 'stale' }))

    const st = useResultStore.getState()
    expect(st.aiFailedHalves.lookup).toBe(false)
    expect(st.aiPendingHalves).toEqual({ lookup: true, core: true })
    expect(st.aiFullCache['run::core']).toBeUndefined()

    s.commitCombinedHalf(retry, 'core', fullResult({ correctForm: 'run' }))
    expect(useResultStore.getState().aiFullCache['run::core']?.correctForm).toBe('run')
  })

  it('a query the user left keeps filling its own cache without touching the screen', () => {
    const s = useResultStore.getState()
    const a = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(a, 'lookup', fullResult({ correctForm: 'run' }))

    s.setWordResult(null)
    const b = s.beginCombined('walk', 'normal', 'word')
    s.applyQuerySkeleton(b, { correctForm: 'walk', senses: [{ senseIndex: 1, zh: '走' }] })

    // run's second half lands while walk is on screen
    s.commitCombinedHalf(a, 'core', fullResult({ correctForm: 'run', coreConcept: { image: 'forward' } }))

    const st = useResultStore.getState()
    expect(st.combinedCache['run::combined']?.core.coreConcept?.image).toBe('forward')
    expect(st.aiFullResult?.correctForm).toBe('walk')
    expect(st.combinedResult?.core.correctForm).toBe('walk')
  })

  it('revisiting a query that is still running shows what it has so far', () => {
    const s = useResultStore.getState()
    const a = s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton(a, skeleton)
    s.commitCombinedHalf(a, 'lookup', fullResult({ correctForm: 'run' }))

    s.setWordResult(null)
    s.beginCombined('walk', 'normal', 'word')

    expect(s.hasCombinedDraft('run')).toBe(true)
    expect(s.showCombinedDraft('run', 'normal', 'word')).toBe(true)
    let st = useResultStore.getState()
    expect(st.aiFullResult?.correctForm).toBe('run')
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: true })

    // and its remaining half paints on arrival, because it is on screen again
    s.commitCombinedHalf(a, 'core', fullResult({ correctForm: 'run', coreConcept: { image: 'forward' } }))
    st = useResultStore.getState()
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(st.combinedResult?.core.coreConcept?.image).toBe('forward')
  })

  it('a word request ignores a phrase-shaped write and vice versa', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedPhraseHalf(id, 'lookup', { phrase: 'run', meaning: 'x', examples: [] })
    expect(useResultStore.getState().phraseCache['run']).toBeUndefined()
  })

  it('drops a skeleton for a request that was superseded', () => {
    const s = useResultStore.getState()
    const old = s.beginCombined('run', 'normal', 'word')
    s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton(old, skeleton)
    expect(useResultStore.getState().aiSkeleton).toBeNull()
  })

  it('never lets a late skeleton downgrade a half that already landed', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(id, 'lookup', fullResult({ etymology: { parts: [], story: 'real' } }))
    s.applyQuerySkeleton(id, skeleton)

    expect(useResultStore.getState().combinedResult?.lookup.etymology?.story).toBe('real')
  })

  it('keeps bypass and normal results in separate slots', () => {
    const s = useResultStore.getState()
    const normal = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(normal, 'lookup', fullResult({ correctForm: 'normal' }))
    const bypass = s.beginCombined('run', 'bypass', 'word')
    s.commitCombinedHalf(bypass, 'lookup', fullResult({ correctForm: 'bypass' }))

    expect(useResultStore.getState().aiFullResult?.correctForm).toBe('bypass')
    expect(s.hasCombinedDraft('run', 'normal')).toBe(true)
    expect(s.hasCombinedDraft('run', 'bypass')).toBe(true)
  })

  it('cancel-all forgets every running request', () => {
    const s = useResultStore.getState()
    const a = s.beginCombined('run', 'normal', 'word')
    s.dropAllCombinedDrafts()
    s.commitCombinedHalf(a, 'lookup', fullResult())
    expect(useResultStore.getState().aiFullCache['run']).toBeUndefined()
    expect(s.hasCombinedDraft('run')).toBe(false)
  })
})

describe('no cross-word bleed', () => {
  it('a new query does not inherit the previous word\'s analysis', () => {
    const s = useResultStore.getState()
    const run = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(run, 'lookup', fullResult({ etymology: { parts: [], story: 'from Old English' } }))
    s.commitCombinedHalf(run, 'core', fullResult())
    s.endCombined(run)

    const awkward = s.beginCombined('尴尬', 'normal', 'word')
    s.applyQuerySkeleton(awkward, { correctForm: 'awkward', senses: [{ senseIndex: 1, zh: '尴尬', en: 'awkward' }] })

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
    const id = s.beginCombined('run', 'normal', 'word')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: true })

    s.commitCombinedHalf(id, 'core', fullResult())
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: false })
  })

  it('does not replace the lookup display with an empty shell when core lands first', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.applyQuerySkeleton(id, skeleton)

    s.commitCombinedHalf(id, 'core', fullResult({
      meanings: [],
      coreConcept: { image: 'forward motion' },
    }))

    const partial = useResultStore.getState()
    expect(partial.aiPendingHalves).toEqual({ lookup: true, core: false })
    expect(partial.aiFullResult?.meanings[0]?.zh).toBe('跑')

    s.commitCombinedHalf(id, 'lookup', fullResult({
      meanings: [{
        senseIndex: 1,
        zh: '跑',
        en: 'to move fast on foot',
        scene: { label: '跑步', description: '向前快速移动' },
        imageQuery: 'person running outdoors',
      }],
    }))

    const complete = useResultStore.getState()
    expect(complete.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(complete.aiAnalysis?.meanings[0]?.scene?.label).toBe('跑步')
    expect(complete.aiAnalysis?.meanings[0]?.imageQuery).toBe('person running outdoors')
  })

  it('tracks a failed half independently and keeps its real reason', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.commitCombinedHalf(id, 'core', fullResult())
    s.settleCombinedHalf(id, 'lookup', 'AI API error 503: Server Overloaded')

    const st = useResultStore.getState()
    expect(st.aiFailedHalves).toEqual({ lookup: true, core: false })
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(st.aiHalfErrors).toEqual({ lookup: 'AI API error 503: Server Overloaded', core: null })
  })

  it('a total failure clears both so nothing shimmers forever', () => {
    const s = useResultStore.getState()
    const id = s.beginCombined('run', 'normal', 'word')
    s.failCombined(id, 'boom')

    const st = useResultStore.getState()
    expect(st.aiStatus).toBe('error')
    expect(st.aiError).toBe('boom')
    expect(st.aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(st.aiIsPartial).toBe(false)
  })

  it('a total failure of a background request leaves the screen alone', () => {
    const s = useResultStore.getState()
    const a = s.beginCombined('run', 'normal', 'word')
    s.setWordResult(null)
    s.beginCombined('walk', 'normal', 'word')
    s.failCombined(a, 'boom')

    const st = useResultStore.getState()
    expect(st.aiStatus).toBe('loading')
    expect(st.aiError).toBeNull()
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
