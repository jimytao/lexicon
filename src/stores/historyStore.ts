import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeQuery } from '../utils/text'
import type { CognitiveMode } from '../types'

const HISTORY_LIMIT = 100

export type AiMode = 'analyze' | 'full' | 'phrase' | null

export interface HistoryEntry {
  word: string
  /** AI Lookup 轨：analyze / full / phrase */
  lookupAiMode: AiMode
  /** Pure Core 轨：full / phrase（Core 不做 analyze） */
  coreAiMode: AiMode
}

interface HistoryStore {
  words: HistoryEntry[]
  add: (word: string, aiMode?: AiMode, cognitive?: CognitiveMode) => void
  upgrade: (word: string, aiMode: AiMode, cognitive?: CognitiveMode) => void
  remove: (word: string) => void
  clear: () => void
}

function emptyEntry(word: string): HistoryEntry {
  return { word, lookupAiMode: null, coreAiMode: null }
}

function migrateEntry(raw: unknown): HistoryEntry | null {
  if (typeof raw === 'string') {
    const word = normalizeQuery(raw)
    return word ? emptyEntry(word) : null
  }
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const word = normalizeQuery(String(obj.word ?? ''))
  if (!word) return null

  const lookupAiMode = (obj.lookupAiMode as AiMode | undefined)
    ?? (obj.aiMode as AiMode | undefined)
    ?? null
  const coreAiMode = (obj.coreAiMode as AiMode | undefined) ?? null
  return { word, lookupAiMode, coreAiMode }
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      words: [],
      add: (word, aiMode = null, cognitive = 'lookup') => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        const existing = get().words.find((e) => normalizeQuery(e.word) === normalized)
        const filtered = get().words.filter((e) => normalizeQuery(e.word) !== normalized)
        const base = existing ?? emptyEntry(normalized)
        const newEntry: HistoryEntry = {
          ...base,
          word: normalized,
          lookupAiMode: cognitive === 'lookup'
            ? (aiMode ?? base.lookupAiMode)
            : base.lookupAiMode,
          coreAiMode: cognitive === 'core'
            ? (aiMode ?? base.coreAiMode)
            : base.coreAiMode,
        }
        // Plain Instant add (aiMode null): just bump to front, keep track flags
        if (aiMode === null) {
          set({
            words: [{
              word: normalized,
              lookupAiMode: base.lookupAiMode,
              coreAiMode: base.coreAiMode,
            }, ...filtered].slice(0, HISTORY_LIMIT),
          })
          return
        }
        set({ words: [newEntry, ...filtered].slice(0, HISTORY_LIMIT) })
      },
      upgrade: (word, aiMode, cognitive = 'lookup') => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        const exists = get().words.some((e) => normalizeQuery(e.word) === normalized)
        if (!exists) {
          get().add(word, aiMode, cognitive)
          return
        }
        set({
          words: get().words.map((e) => {
            if (normalizeQuery(e.word) !== normalized) return e
            if (cognitive === 'core') {
              return { ...e, coreAiMode: aiMode }
            }
            return { ...e, lookupAiMode: aiMode }
          }),
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
        state.words = (state.words as unknown[])
          .map(migrateEntry)
          .filter((e): e is HistoryEntry => e !== null)
      },
    }
  )
)
