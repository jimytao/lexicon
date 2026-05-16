import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeQuery } from '../utils/text'

const HISTORY_LIMIT = 100

export type AiMode = 'analyze' | 'full' | 'phrase' | null

export interface HistoryEntry {
  word: string
  aiMode: AiMode
}

interface HistoryStore {
  words: HistoryEntry[]
  add: (word: string, aiMode?: AiMode) => void
  upgrade: (word: string, aiMode: AiMode) => void
  remove: (word: string) => void
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      words: [],
      add: (word, aiMode = null) => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        const existing = get().words.find((e) => normalizeQuery(e.word) === normalized)
        const filtered = get().words.filter((e) => normalizeQuery(e.word) !== normalized)
        const newEntry: HistoryEntry = {
          word: normalized,
          aiMode: aiMode ?? (existing?.aiMode ?? null),
        }
        set({ words: [newEntry, ...filtered].slice(0, HISTORY_LIMIT) })
      },
      upgrade: (word, aiMode) => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        set({
          words: get().words.map((e) =>
            normalizeQuery(e.word) === normalized ? { ...e, aiMode } : e
          ),
        })
      },
      remove: (word) => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        set({ words: get().words.filter((e) => normalizeQuery(e.word) !== normalized) })
      },
      clear: () => set({ words: [] }),
    }),
    {
      name: 'lexicon-history',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.words = (state.words as any[]).map((w) =>
          typeof w === 'string' ? { word: w, aiMode: null } : w
        )
      },
    }
  )
)
