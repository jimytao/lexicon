import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
        const existing = get().words.find((e) => e.word === word)
        const filtered = get().words.filter((e) => e.word !== word)
        const newEntry: HistoryEntry = {
          word,
          aiMode: aiMode ?? (existing?.aiMode ?? null),
        }
        set({ words: [newEntry, ...filtered].slice(0, HISTORY_LIMIT) })
      },
      upgrade: (word, aiMode) => {
        set({
          words: get().words.map((e) =>
            e.word === word ? { ...e, aiMode } : e
          ),
        })
      },
      remove: (word) => set({ words: get().words.filter((e) => e.word !== word) }),
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
