import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, ChatMessage, Mnemonic } from '../types'

export type AiStatus = 'idle' | 'loading' | 'success' | 'error'

interface ResultStore {
  wordResult: WordResult | null
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiFullResult: AiFullResult | null
  phraseResult: PhraseResult | null
  chatMessages: ChatMessage[]
  aiStatus: AiStatus
  aiError: string | null
  aiCache: Record<string, AiAnalysis>
  aiFullCache: Record<string, AiFullResult>
  phraseCache: Record<string, PhraseResult>

  setWordResult: (r: WordResult | null) => void
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  setAiFullResult: (word: string, r: AiFullResult) => void
  setPhraseResult: (key: string, r: PhraseResult) => void
  setChatMessages: (msgs: ChatMessage[]) => void
  addChatMessage: (msg: ChatMessage) => void
  setAiError: (e: string) => void
  updateMnemonic: (word: string, m: Mnemonic) => void
  updatePhraseMnemonic: (key: string, m: Mnemonic) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string) => AiFullResult | null
  getCachedPhrase: (key: string) => PhraseResult | null
  clearCache: () => void
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
      chatMessages: [],
      aiStatus: 'idle',
      aiError: null,
      aiCache: {},
      aiFullCache: {},
      phraseCache: {},

      setWordResult: (wordResult) => set({ wordResult, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, chatMessages: [], aiStatus: 'idle', aiError: null }),
      setRelatedPhrases: (relatedPhrases) => set({ relatedPhrases }),
      setAiStatus: (aiStatus) => set({ aiStatus }),
      setAiAnalysis: (word, aiAnalysis) => {
        const cache = { ...get().aiCache }
        delete cache[word] // Move to end
        cache[word] = aiAnalysis
        
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiCache: cache, aiAnalysis, aiStatus: 'success' })
      },
      updateMnemonic: (word, mnemonic) => {
        const current = get().aiAnalysis
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiCache }
          delete cache[word]
          cache[word] = updated
          set({ aiCache: cache, aiAnalysis: updated })
        }
      },
      updatePhraseMnemonic: (key, mnemonic) => {
        const current = get().phraseResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().phraseCache }
          delete cache[key]
          cache[key] = updated
          set({ phraseCache: cache, phraseResult: updated })
        }
      },
      setAiFullResult: (word, aiFullResult) => {
        const cache = { ...get().aiFullCache }
        delete cache[word]
        cache[word] = aiFullResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiFullCache: cache, aiFullResult, aiStatus: 'success' })
      },
      setPhraseResult: (key, phraseResult) => {
        const cache = { ...get().phraseCache }
        delete cache[key]
        cache[key] = phraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ phraseCache: cache, phraseResult, aiStatus: 'success' })
      },
      setChatMessages: (chatMessages) => set({ chatMessages }),
      addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, msg] }),
      setAiError: (aiError) => set({ aiError, aiStatus: 'error' }),
      getCachedAi: (word) => {
        const cache = get().aiCache
        if (cache[word]) {
          // Touch: move to end
          const updated = { ...cache }
          const val = updated[word]
          delete updated[word]
          updated[word] = val
          set({ aiCache: updated })
          return val
        }
        return null
      },
      getCachedAiFull: (word) => {
        const cache = get().aiFullCache
        if (cache[word]) {
          const updated = { ...cache }
          const val = updated[word]
          delete updated[word]
          updated[word] = val
          set({ aiFullCache: updated })
          return val
        }
        return null
      },
      getCachedPhrase: (key) => {
        const cache = get().phraseCache
        if (cache[key]) {
          const updated = { ...cache }
          const val = updated[key]
          delete updated[key]
          updated[key] = val
          set({ phraseCache: updated })
          return val
        }
        return null
      },
      clearCache: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {} }),
      reset: () => set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, chatMessages: [], aiStatus: 'idle', aiError: null }),
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
