import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const HISTORY_LIMIT = 100

interface HistoryStore {
  words: string[]
  add: (word: string) => void
  remove: (word: string) => void
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      words: [],
      add: (word) => {
        const filtered = get().words.filter((w) => w !== word)
        set({ words: [word, ...filtered].slice(0, HISTORY_LIMIT) })
      },
      remove: (word) => set({ words: get().words.filter((w) => w !== word) }),
      clear: () => set({ words: [] }),
    }),
    { name: 'lexicon-history' }
  )
)
