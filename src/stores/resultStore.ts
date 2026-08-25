import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, Mnemonic, CognitiveMode, CombinedAiResult, CombinedPhraseResult, Scene } from '../types'
import { normalizeQuery, cognitiveCacheKey } from '../utils/text'
import { combinedCacheKey, reconstructFromLegacy, reconstructPhraseFromLegacy, type SearchTag } from '../utils/combinedResult'
import { aiFullToAnalysis } from '../utils/aiFullToAnalysis'

export type AiStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Stage-1 resolution skeleton. Its job is NOT to enumerate senses for their own
 * sake — it is the disambiguation contract both halves must agree on:
 * which English word are we actually explaining, and (for zh input) which senses.
 */
export interface QuerySkeleton {
  correctForm?: string
  pos?: string
  phonetic?: string
  senses: Array<{ pos?: string; zh: string; en?: string; senseIndex: number }>
}

export type CombinedHalf = 'lookup' | 'core'

/** Which halves of a split combined request are still in flight. */
export interface PendingHalves { lookup: boolean; core: boolean }

interface CombinedDraft<T> {
  key: string
  tag: SearchTag
  lookup: T | null
  core: T | null
}

const NO_PENDING: PendingHalves = { lookup: false, core: false }

function emptyFull(skeleton: QuerySkeleton | null, fallbackWord: string): AiFullResult {
  return {
    correctForm: skeleton?.correctForm || fallbackWord,
    phonetic: skeleton?.phonetic || '',
    pos: skeleton?.pos || '',
    meanings: (skeleton?.senses ?? []).map(sn => ({
      senseIndex: sn.senseIndex,
      zh: sn.zh,
      en: sn.en ?? '',
      pos: sn.pos,
    })),
    examples: [],
  }
}

function emptyPhrase(skeleton: QuerySkeleton | null, fallbackPhrase: string): PhraseResult {
  const first = skeleton?.senses?.[0]
  return {
    phrase: fallbackPhrase,
    correctForm: skeleton?.correctForm || fallbackPhrase,
    meaning: first ? (first.zh || first.en || '') : '',
    examples: [],
  }
}

interface ResultStore {
  wordResult: WordResult | null
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiFullResult: AiFullResult | null
  phraseResult: PhraseResult | null
  /** v0.9.0: active combined result (both lookup + core populated from one AI call) */
  combinedResult: CombinedAiResult | null
  /** v0.9.0: active combined phrase result */
  combinedPhraseResult: CombinedPhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  /** Split-call progress: which halves are still in flight (v0.9.15). */
  aiPendingHalves: PendingHalves
  /** True while the displayed result is only the stage-1 skeleton preview. */
  aiIsPartial: boolean
  /** Stage-1 skeleton for the active query (display only, never cached). */
  aiSkeleton: QuerySkeleton | null
  aiCache: Record<string, AiAnalysis>
  aiFullCache: Record<string, AiFullResult>
  phraseCache: Record<string, PhraseResult>
  /** v0.9.0: single combined cache (replaces separate lookup/core caches for new searches) */
  combinedCache: Record<string, CombinedAiResult>
  combinedPhraseCache: Record<string, CombinedPhraseResult>

  setWordResult: (r: WordResult | null, clearAi?: boolean) => void
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  /** Start a split combined request: resets the draft accumulator and pending flags. */
  beginCombined: (query: string, tag: SearchTag, kind: 'word' | 'phrase') => void
  /** Apply the stage-1 skeleton as an early preview. Never writes to any cache. */
  applyQuerySkeleton: (query: string, skeleton: QuerySkeleton, kind: 'word' | 'phrase') => void
  /** Commit one half of a split word request; caches only once both halves land. */
  commitCombinedHalf: (word: string, half: CombinedHalf, r: AiFullResult, tag?: SearchTag) => void
  /** Commit one half of a split phrase request. */
  commitCombinedPhraseHalf: (phrase: string, half: CombinedHalf, r: PhraseResult, tag?: SearchTag) => void
  /** Mark a half as settled without a result (it failed) so its spinner stops. */
  settleCombinedHalf: (half: CombinedHalf) => void
  setAiFullResult: (word: string, r: AiFullResult, cognitive?: CognitiveMode) => void
  setPhraseResult: (key: string, r: PhraseResult, cognitive?: CognitiveMode) => void
  /** v0.9.0: store combined result and update active display */
  setCombinedResult: (word: string, r: CombinedAiResult, tag?: SearchTag) => void
  setCombinedPhraseResult: (phrase: string, r: CombinedPhraseResult, tag?: SearchTag) => void
  setAiError: (e: string) => void
  updateMnemonic: (word: string, m: Mnemonic) => void
  updateMeaningExtension: (word: string, index: number, ext: { scene?: Scene; imageQuery?: string }) => void
  updateFullMnemonic: (word: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  updatePhraseMnemonic: (key: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string, cognitive?: CognitiveMode) => AiFullResult | null
  getCachedPhrase: (key: string, cognitive?: CognitiveMode) => PhraseResult | null
  /** v0.9.0: get combined result from cache (with legacy fallback reconstruction) */
  getCachedCombined: (word: string, tag?: SearchTag) => CombinedAiResult | null
  getCachedCombinedPhrase: (phrase: string, tag?: SearchTag) => CombinedPhraseResult | null
  clearCache: () => void
  clearCacheOnly: () => void
  evictCacheEntry: (key: string) => void
  reset: () => void
}

const CACHE_LIMIT = 100

/**
 * Transient accumulators for the two halves of a split combined request.
 * Module-scoped rather than store state: they change on every half and must not
 * trigger a re-render of their own. Keyed so a late half from a superseded query
 * is dropped even if the request gate somehow lets it through.
 */
let wordDraft: CombinedDraft<AiFullResult> | null = null
let phraseDraft: CombinedDraft<PhraseResult> | null = null

export const useResultStore = create<ResultStore>()(
  persist(
    (set, get) => ({
      wordResult: null,
      relatedPhrases: [],
      aiAnalysis: null,
      aiFullResult: null,
      phraseResult: null,
      combinedResult: null,
      combinedPhraseResult: null,
      aiStatus: 'idle',
      aiError: null,
      aiPendingHalves: NO_PENDING,
      aiIsPartial: false,
      aiSkeleton: null,
      aiCache: {},
      aiFullCache: {},
      phraseCache: {},
      combinedCache: {},
      combinedPhraseCache: {},

      setWordResult: (wordResult, clearAi = true) => {
        if (clearAi) {
          wordDraft = null
          phraseDraft = null
          set({ 
            wordResult, 
            relatedPhrases: [], 
            aiAnalysis: null, 
            aiFullResult: null, 
            phraseResult: null, 
            aiStatus: 'idle', 
            aiError: null,
            aiPendingHalves: NO_PENDING,
            aiIsPartial: false,
            aiSkeleton: null,
          })
        } else {
          set({ wordResult })
        }
      },
      setRelatedPhrases: (relatedPhrases) => set({ relatedPhrases }),
      setAiStatus: (aiStatus) => set({ aiStatus }),
      setAiAnalysis: (word, aiAnalysis) => {
        const normalized = normalizeQuery(word)
        const cache = { ...get().aiCache }
        delete cache[normalized] // Move to end
        cache[normalized] = aiAnalysis
        
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiCache: cache, aiAnalysis, aiStatus: 'success' })
      },
      beginCombined: (query, tag, kind) => {
        const key = combinedCacheKey(query, tag)
        if (kind === 'word') {
          wordDraft = { key, tag, lookup: null, core: null }
          phraseDraft = null
        } else {
          phraseDraft = { key, tag, lookup: null, core: null }
          wordDraft = null
        }
        set({
          aiStatus: 'loading',
          aiError: null,
          aiSkeleton: null,
          aiIsPartial: false,
          aiPendingHalves: { lookup: true, core: true },
        })
      },

      applyQuerySkeleton: (query, skeleton, kind) => {
        const draft = kind === 'word' ? wordDraft : phraseDraft
        // Stale guard: a skeleton for a query we are no longer resolving must not paint.
        if (!draft || draft.key !== combinedCacheKey(query, draft.tag)) return
        // Never downgrade: if a real half already landed, the skeleton is obsolete.
        if (draft.lookup || draft.core) return

        if (kind === 'word') {
          const preview = emptyFull(skeleton, query)
          set({
            aiSkeleton: skeleton,
            aiIsPartial: true,
            aiStatus: 'success',
            combinedResult: { lookup: preview, core: preview },
            aiFullResult: preview,
            aiAnalysis: aiFullToAnalysis(preview),
          })
        } else {
          const preview = emptyPhrase(skeleton, query)
          set({
            aiSkeleton: skeleton,
            aiIsPartial: true,
            aiStatus: 'success',
            combinedPhraseResult: { lookup: preview, core: preview },
            phraseResult: preview,
          })
        }
      },

      commitCombinedHalf: (word, half, result, tag = 'normal') => {
        const key = combinedCacheKey(word, tag)
        if (!wordDraft || wordDraft.key !== key) return
        wordDraft[half] = result

        const skeleton = get().aiSkeleton
        const lookup = wordDraft.lookup ?? emptyFull(skeleton, word)
        const core = wordDraft.core ?? emptyFull(skeleton, word)
        const complete = Boolean(wordDraft.lookup && wordDraft.core)

        // A single half is still worth persisting on its own: getCachedCombined's
        // legacy path can reconstruct from aiFullCache if the other half never lands.
        const fullCache = { ...get().aiFullCache }
        const halfKey = cognitiveCacheKey(word, half)
        delete fullCache[halfKey]
        fullCache[halfKey] = result
        const fullKeys = Object.keys(fullCache)
        if (fullKeys.length > CACHE_LIMIT) delete fullCache[fullKeys[0]]

        const combinedCache = { ...get().combinedCache }
        if (complete) {
          delete combinedCache[key]
          combinedCache[key] = { lookup, core }
          const keys = Object.keys(combinedCache)
          if (keys.length > CACHE_LIMIT) delete combinedCache[keys[0]]
        }

        set({
          aiFullCache: fullCache,
          combinedCache,
          combinedResult: { lookup, core },
          aiFullResult: lookup,
          aiAnalysis: aiFullToAnalysis(lookup),
          aiStatus: 'success',
          aiError: null,
          aiIsPartial: !complete,
          aiPendingHalves: { ...get().aiPendingHalves, [half]: false },
        })
      },

      commitCombinedPhraseHalf: (phrase, half, result, tag = 'normal') => {
        const key = combinedCacheKey(phrase, tag)
        if (!phraseDraft || phraseDraft.key !== key) return
        phraseDraft[half] = result

        const skeleton = get().aiSkeleton
        const lookup = phraseDraft.lookup ?? emptyPhrase(skeleton, phrase)
        const core = phraseDraft.core ?? emptyPhrase(skeleton, phrase)
        const complete = Boolean(phraseDraft.lookup && phraseDraft.core)

        const pCache = { ...get().phraseCache }
        const halfKey = cognitiveCacheKey(phrase, half)
        delete pCache[halfKey]
        pCache[halfKey] = result
        const pKeys = Object.keys(pCache)
        if (pKeys.length > CACHE_LIMIT) delete pCache[pKeys[0]]

        const combinedPhraseCache = { ...get().combinedPhraseCache }
        if (complete) {
          delete combinedPhraseCache[key]
          combinedPhraseCache[key] = { lookup, core }
          const keys = Object.keys(combinedPhraseCache)
          if (keys.length > CACHE_LIMIT) delete combinedPhraseCache[keys[0]]
        }

        set({
          phraseCache: pCache,
          combinedPhraseCache,
          combinedPhraseResult: { lookup, core },
          phraseResult: lookup,
          aiStatus: 'success',
          aiError: null,
          aiIsPartial: !complete,
          aiPendingHalves: { ...get().aiPendingHalves, [half]: false },
        })
      },

      settleCombinedHalf: (half) => {
        const pending = { ...get().aiPendingHalves, [half]: false }
        const anyLanded = Boolean(wordDraft?.lookup || wordDraft?.core || phraseDraft?.lookup || phraseDraft?.core)
        set({
          aiPendingHalves: pending,
          // Both halves failed and nothing ever rendered — leave partial off so the
          // caller's setAiError produces a clean error state instead of a stuck shimmer.
          aiIsPartial: anyLanded ? get().aiIsPartial : false,
        })
      },
      updateMnemonic: (word, mnemonic) => {
        const normalized = normalizeQuery(word)
        const current = get().aiAnalysis
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiCache }
          delete cache[normalized]
          cache[normalized] = updated

          // Also sync combinedCache lookup half so history re-opens pick up the mnemonic.
          // (ResultView uses aiAnalysis, but history loads restore via combinedCache.)
          const combinedCache = { ...get().combinedCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(word, tag)
            if (combinedCache[ck]) {
              combinedCache[ck] = {
                ...combinedCache[ck],
                lookup: { ...combinedCache[ck].lookup, mnemonic },
              }
            }
          }

          set({ aiCache: cache, aiAnalysis: updated, combinedCache })
        }
      },

      updateMeaningExtension: (word, index, ext) => {
        const normalized = normalizeQuery(word)
        const current = get().aiAnalysis
        const combined = get().combinedResult
        const combinedKey = combinedCacheKey(word, 'normal')

        let updatedAi = current
        if (current) {
          const meanings = [...(current.meanings ?? [])]
          if (meanings[index]) {
            meanings[index] = {
              ...meanings[index],
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          } else {
            meanings[index] = {
              zh: '',
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          }
          updatedAi = { ...current, meanings }
        }

        let updatedCombined = combined
        const combinedCache = { ...get().combinedCache }
        if (combined) {
          const lookupMeanings = [...(combined.lookup.meanings ?? [])]
          if (lookupMeanings[index]) {
            lookupMeanings[index] = {
              ...lookupMeanings[index],
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          } else {
            lookupMeanings[index] = {
              zh: '',
              en: '',
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          }
          const updatedLookup = { ...combined.lookup, meanings: lookupMeanings }
          updatedCombined = { ...combined, lookup: updatedLookup }
          if (combinedCache[combinedKey]) {
            combinedCache[combinedKey] = updatedCombined
          }
        }

        const cache = { ...get().aiCache }
        if (updatedAi) {
          delete cache[normalized]
          cache[normalized] = updatedAi
        }

        set({
          aiCache: cache,
          aiAnalysis: updatedAi,
          combinedResult: updatedCombined,
          combinedCache,
        })
      },
      updateFullMnemonic: (word, mnemonic, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const current = get().aiFullResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiFullCache }
          delete cache[cacheKey]
          cache[cacheKey] = updated

          // Also sync combinedCache so history re-opens pick up the mnemonic.
          // The mnemonic lives in the 'lookup' or 'core' half matching `cognitive`.
          const half = cognitive === 'core' ? 'core' : 'lookup'
          const combinedCache = { ...get().combinedCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(word, tag)
            if (combinedCache[ck]) {
              combinedCache[ck] = {
                ...combinedCache[ck],
                [half]: { ...combinedCache[ck][half], mnemonic },
              }
            }
          }

          set({ aiFullCache: cache, aiFullResult: updated, combinedCache })
        }
      },
      updatePhraseMnemonic: (key, mnemonic, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const current = get().phraseResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().phraseCache }
          delete cache[cacheKey]
          cache[cacheKey] = updated

          // Also sync combinedPhraseCache so history re-opens pick up the mnemonic.
          const half = cognitive === 'core' ? 'core' : 'lookup'
          const combinedPhraseCache = { ...get().combinedPhraseCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(key, tag)
            if (combinedPhraseCache[ck]) {
              combinedPhraseCache[ck] = {
                ...combinedPhraseCache[ck],
                [half]: { ...combinedPhraseCache[ck][half], mnemonic },
              }
            }
          }

          set({ phraseCache: cache, phraseResult: updated, combinedPhraseCache })
        }
      },

      setAiFullResult: (word, aiFullResult, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const cache = { ...get().aiFullCache }
        delete cache[cacheKey]
        cache[cacheKey] = aiFullResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiFullCache: cache, aiFullResult, aiStatus: 'success' })
      },
      setPhraseResult: (key, phraseResult, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const cache = { ...get().phraseCache }
        delete cache[cacheKey]
        cache[cacheKey] = phraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ phraseCache: cache, phraseResult, aiStatus: 'success' })
      },
      setAiError: (aiError) => set({
        aiError,
        aiStatus: 'error',
        aiPendingHalves: NO_PENDING,
        aiIsPartial: false,
      }),

      // v0.9.0: combined cache tagged by normal vs bypass
      setCombinedResult: (word, combinedResult, tag = 'normal') => {
        const key = combinedCacheKey(word, tag)
        const cache = { ...get().combinedCache }
        delete cache[key]
        cache[key] = combinedResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        wordDraft = { key, tag, lookup: combinedResult.lookup, core: combinedResult.core }
        set({
          combinedCache: cache,
          combinedResult,
          aiFullResult: combinedResult.lookup,
          aiAnalysis: aiFullToAnalysis(combinedResult.lookup),
          aiStatus: 'success',
          aiPendingHalves: NO_PENDING,
          aiIsPartial: false,
          aiSkeleton: null,
        })
      },
      setCombinedPhraseResult: (phrase, combinedPhraseResult, tag = 'normal') => {
        const key = combinedCacheKey(phrase, tag)
        const cache = { ...get().combinedPhraseCache }
        delete cache[key]
        cache[key] = combinedPhraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        phraseDraft = { key, tag, lookup: combinedPhraseResult.lookup, core: combinedPhraseResult.core }
        set({
          combinedPhraseCache: cache,
          combinedPhraseResult,
          phraseResult: combinedPhraseResult.lookup,
          aiStatus: 'success',
          aiPendingHalves: NO_PENDING,
          aiIsPartial: false,
          aiSkeleton: null,
        })
      },
      getCachedCombined: (word, tag = 'normal') => {
        const key = combinedCacheKey(word, tag)
        const cache = get().combinedCache
        if (cache[key]) {
          const updated = { ...cache }
          const val = updated[key]
          delete updated[key]
          updated[key] = val
          set({ combinedCache: updated })
          return val
        }
        // Legacy fallback (normal tag only): reconstruct from old separate caches if available
        if (tag === 'normal') {
          const n = normalizeQuery(word)
          const legacyLookup = get().aiFullCache[n] ?? null
          const legacyCore = get().aiFullCache[cognitiveCacheKey(n, 'core')] ?? null
          if (legacyLookup || legacyCore) {
            return reconstructFromLegacy(
              legacyLookup ?? legacyCore!,
              legacyCore
            )
          }
        }
        return null
      },
      getCachedCombinedPhrase: (phrase, tag = 'normal') => {
        const key = combinedCacheKey(phrase, tag)
        const cache = get().combinedPhraseCache
        if (cache[key]) {
          const updated = { ...cache }
          const val = updated[key]
          delete updated[key]
          updated[key] = val
          set({ combinedPhraseCache: updated })
          return val
        }
        if (tag === 'normal') {
          const n = normalizeQuery(phrase)
          const legacyLookup = get().phraseCache[n] ?? null
          const legacyCore = get().phraseCache[cognitiveCacheKey(n, 'core')] ?? null
          if (legacyLookup || legacyCore) {
            return reconstructPhraseFromLegacy(
              legacyLookup ?? legacyCore!,
              legacyCore
            )
          }
        }
        return null
      },
      getCachedAi: (word) => {
        const normalized = normalizeQuery(word)
        const cache = get().aiCache
        if (cache[normalized]) {
          // Touch: move to end
          const updated = { ...cache }
          const val = updated[normalized]
          delete updated[normalized]
          updated[normalized] = val
          set({ aiCache: updated })
          return val
        }
        return null
      },
      getCachedAiFull: (word, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const cache = get().aiFullCache
        if (cache[cacheKey]) {
          const updated = { ...cache }
          const val = updated[cacheKey]
          delete updated[cacheKey]
          updated[cacheKey] = val
          set({ aiFullCache: updated })
          return val
        }
        return null
      },
      getCachedPhrase: (key, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const cache = get().phraseCache
        if (cache[cacheKey]) {
          const updated = { ...cache }
          const val = updated[cacheKey]
          delete updated[cacheKey]
          updated[cacheKey] = val
          set({ phraseCache: updated })
          return val
        }
        return null
      },
      clearCache: () => { wordDraft = null; phraseDraft = null; return set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, combinedCache: {}, combinedPhraseCache: {}, aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null, aiPendingHalves: NO_PENDING, aiIsPartial: false, aiSkeleton: null }) },
      clearCacheOnly: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, combinedCache: {}, combinedPhraseCache: {} }),
      evictCacheEntry: (key) => {
        const normalized = normalizeQuery(key)
        set((state) => {
          const aiCache = { ...state.aiCache }
          const aiFullCache = { ...state.aiFullCache }
          const phraseCache = { ...state.phraseCache }
          delete aiCache[normalized]
          delete aiFullCache[normalized]
          delete aiFullCache[cognitiveCacheKey(normalized, 'core')]
          delete phraseCache[normalized]
          delete phraseCache[cognitiveCacheKey(normalized, 'core')]
          const combinedCache = { ...state.combinedCache }
          const combinedPhraseCache = { ...state.combinedPhraseCache }
          delete combinedCache[combinedCacheKey(normalized)]
          delete combinedPhraseCache[combinedCacheKey(normalized)]
          return { aiCache, aiFullCache, phraseCache, combinedCache, combinedPhraseCache }
        })
      },
      reset: () => { wordDraft = null; phraseDraft = null; return set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null, aiPendingHalves: NO_PENDING, aiIsPartial: false, aiSkeleton: null }) },
    }),
    { 
      name: 'lexicon-results',
      partialize: (state) => ({
        aiCache: state.aiCache,
        aiFullCache: state.aiFullCache,
        phraseCache: state.phraseCache,
        combinedCache: state.combinedCache,
        combinedPhraseCache: state.combinedPhraseCache,
      })
    }
  )
)
