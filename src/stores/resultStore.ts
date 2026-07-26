import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, Mnemonic, CognitiveMode, CombinedAiResult, CombinedPhraseResult } from '../types'
import { normalizeQuery, cognitiveCacheKey } from '../utils/text'
import { combinedCacheKey, reconstructFromLegacy, reconstructPhraseFromLegacy } from '../utils/combinedResult'

export type AiStatus = 'idle' | 'loading' | 'success' | 'error'

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
  setAiFullResult: (word: string, r: AiFullResult, cognitive?: CognitiveMode) => void
  setPhraseResult: (key: string, r: PhraseResult, cognitive?: CognitiveMode) => void
  /** v0.9.0: store combined result and update active display */
  setCombinedResult: (word: string, r: CombinedAiResult) => void
  setCombinedPhraseResult: (phrase: string, r: CombinedPhraseResult) => void
  setAiError: (e: string) => void
  updateMnemonic: (word: string, m: Mnemonic) => void
  updateFullMnemonic: (word: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  updatePhraseMnemonic: (key: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string, cognitive?: CognitiveMode) => AiFullResult | null
  getCachedPhrase: (key: string, cognitive?: CognitiveMode) => PhraseResult | null
  /** v0.9.0: get combined result from cache (with legacy fallback reconstruction) */
  getCachedCombined: (word: string) => CombinedAiResult | null
  getCachedCombinedPhrase: (phrase: string) => CombinedPhraseResult | null
  clearCache: () => void
  clearCacheOnly: () => void
  evictCacheEntry: (key: string) => void
  reset: () => void
}

const CACHE_LIMIT = 100

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
      aiCache: {},
      aiFullCache: {},
      phraseCache: {},
      combinedCache: {},
      combinedPhraseCache: {},

      setWordResult: (wordResult, clearAi = true) => {
        if (clearAi) {
          set({ 
            wordResult, 
            relatedPhrases: [], 
            aiAnalysis: null, 
            aiFullResult: null, 
            phraseResult: null, 
            aiStatus: 'idle', 
            aiError: null 
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
      updateMnemonic: (word, mnemonic) => {
        const normalized = normalizeQuery(word)
        const current = get().aiAnalysis
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiCache }
          delete cache[normalized]
          cache[normalized] = updated
          set({ aiCache: cache, aiAnalysis: updated })
        }
      },
      updateFullMnemonic: (word, mnemonic, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const current = get().aiFullResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiFullCache }
          delete cache[cacheKey]
          cache[cacheKey] = updated
          set({ aiFullCache: cache, aiFullResult: updated })
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
          set({ phraseCache: cache, phraseResult: updated })
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
      setAiError: (aiError) => set({ aiError, aiStatus: 'error' }),

      // v0.9.0: combined cache
      setCombinedResult: (word, combinedResult) => {
        const key = combinedCacheKey(word)
        const cache = { ...get().combinedCache }
        delete cache[key]
        cache[key] = combinedResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        // Also set the individual lookup/core views for legacy compatibility
        set({
          combinedCache: cache,
          combinedResult,
          aiFullResult: combinedResult.lookup,
          aiStatus: 'success',
        })
      },
      setCombinedPhraseResult: (phrase, combinedPhraseResult) => {
        const key = combinedCacheKey(phrase)
        const cache = { ...get().combinedPhraseCache }
        delete cache[key]
        cache[key] = combinedPhraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        set({
          combinedPhraseCache: cache,
          combinedPhraseResult,
          phraseResult: combinedPhraseResult.lookup,
          aiStatus: 'success',
        })
      },
      getCachedCombined: (word) => {
        const key = combinedCacheKey(word)
        const cache = get().combinedCache
        if (cache[key]) {
          const updated = { ...cache }
          const val = updated[key]
          delete updated[key]
          updated[key] = val
          set({ combinedCache: updated })
          return val
        }
        // Legacy fallback: reconstruct from old separate caches if available
        const n = normalizeQuery(word)
        const legacyLookup = get().aiFullCache[n] ?? null
        const legacyCore = get().aiFullCache[cognitiveCacheKey(n, 'core')] ?? null
        if (legacyLookup || legacyCore) {
          return reconstructFromLegacy(
            legacyLookup ?? legacyCore!,
            legacyCore
          )
        }
        return null
      },
      getCachedCombinedPhrase: (phrase) => {
        const key = combinedCacheKey(phrase)
        const cache = get().combinedPhraseCache
        if (cache[key]) {
          const updated = { ...cache }
          const val = updated[key]
          delete updated[key]
          updated[key] = val
          set({ combinedPhraseCache: updated })
          return val
        }
        // Legacy fallback
        const n = normalizeQuery(phrase)
        const legacyLookup = get().phraseCache[n] ?? null
        const legacyCore = get().phraseCache[cognitiveCacheKey(n, 'core')] ?? null
        if (legacyLookup || legacyCore) {
          return reconstructPhraseFromLegacy(
            legacyLookup ?? legacyCore!,
            legacyCore
          )
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
      clearCache: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, combinedCache: {}, combinedPhraseCache: {}, aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null }),
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
      reset: () => set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null }),
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
