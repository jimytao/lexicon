import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, Mnemonic, CognitiveMode } from '../types'
import { normalizeQuery, cognitiveCacheKey } from '../utils/text'

export type AiStatus = 'idle' | 'loading' | 'success' | 'error'

interface ResultStore {
  wordResult: WordResult | null
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiFullResult: AiFullResult | null
  phraseResult: PhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  aiCache: Record<string, AiAnalysis>
  aiFullCache: Record<string, AiFullResult>
  phraseCache: Record<string, PhraseResult>

  setWordResult: (r: WordResult | null, clearAi?: boolean) => void
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  setAiFullResult: (word: string, r: AiFullResult, cognitive?: CognitiveMode) => void
  setPhraseResult: (key: string, r: PhraseResult, cognitive?: CognitiveMode) => void
  setAiError: (e: string) => void
  updateMnemonic: (word: string, m: Mnemonic) => void
  updateFullMnemonic: (word: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  updatePhraseMnemonic: (key: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string, cognitive?: CognitiveMode) => AiFullResult | null
  getCachedPhrase: (key: string, cognitive?: CognitiveMode) => PhraseResult | null
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
      aiStatus: 'idle',
      aiError: null,
      aiCache: {},
      aiFullCache: {},
      phraseCache: {},

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
      clearCache: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, aiAnalysis: null, aiFullResult: null, phraseResult: null, aiStatus: 'idle', aiError: null }),
      clearCacheOnly: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {} }),
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
          return { aiCache, aiFullCache, phraseCache }
        })
      },
      reset: () => set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, aiStatus: 'idle', aiError: null }),
    }),
    { 
      name: 'lexicon-results',
      partialize: (state) => ({
        aiCache: state.aiCache,
        aiFullCache: state.aiFullCache,
        phraseCache: state.phraseCache,
      })
    }
  )
)
