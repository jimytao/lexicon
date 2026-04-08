import { create } from 'zustand'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, ChatMessage } from '../types'

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
  aiCache: Map<string, AiAnalysis>
  aiFullCache: Map<string, AiFullResult>
  phraseCache: Map<string, PhraseResult>

  setWordResult: (r: WordResult | null) => void
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  setAiFullResult: (word: string, r: AiFullResult) => void
  setPhraseResult: (key: string, r: PhraseResult) => void
  setChatMessages: (msgs: ChatMessage[]) => void
  addChatMessage: (msg: ChatMessage) => void
  setAiError: (e: string) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string) => AiFullResult | null
  getCachedPhrase: (key: string) => PhraseResult | null
  reset: () => void
}

export const useResultStore = create<ResultStore>((set, get) => ({
  wordResult: null,
  relatedPhrases: [],
  aiAnalysis: null,
  aiFullResult: null,
  phraseResult: null,
  chatMessages: [],
  aiStatus: 'idle',
  aiError: null,
  aiCache: new Map(),
  aiFullCache: new Map(),
  phraseCache: new Map(),

  setWordResult: (wordResult) => set({ wordResult, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, chatMessages: [], aiStatus: 'idle', aiError: null }),
  setRelatedPhrases: (relatedPhrases) => set({ relatedPhrases }),
  setAiStatus: (aiStatus) => set({ aiStatus }),
  setAiAnalysis: (word, aiAnalysis) => {
    get().aiCache.set(word, aiAnalysis)
    set({ aiAnalysis, aiStatus: 'success' })
  },
  setAiFullResult: (word, aiFullResult) => {
    get().aiFullCache.set(word, aiFullResult)
    set({ aiFullResult, aiStatus: 'success' })
  },
  setPhraseResult: (key, phraseResult) => {
    get().phraseCache.set(key, phraseResult)
    set({ phraseResult, aiStatus: 'success' })
  },
  setChatMessages: (chatMessages) => set({ chatMessages }),
  addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, msg] }),
  setAiError: (aiError) => set({ aiError, aiStatus: 'error' }),
  getCachedAi: (word) => get().aiCache.get(word) ?? null,
  getCachedAiFull: (word) => get().aiFullCache.get(word) ?? null,
  getCachedPhrase: (key) => get().phraseCache.get(key) ?? null,
  reset: () => set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, chatMessages: [], aiStatus: 'idle', aiError: null }),
}))
