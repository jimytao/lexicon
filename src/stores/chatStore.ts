import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage, CognitiveMode } from '../types'
import { cognitiveCacheKey, normalizeQuery } from '../utils/text'

const CHAT_WORD_LIMIT = 100 // 最多保留 100 个 key（含 q / q::core，与历史/AI 缓存量级对齐）

interface ChatStore {
  messagesByWord: Record<string, ChatMessage[]>
  getMessages: (word: string, cognitive?: CognitiveMode) => ChatMessage[]
  addMessage: (word: string, msg: ChatMessage, cognitive?: CognitiveMode) => void
  /** Omit cognitive to clear both Lookup and Core tracks (matches evictCacheEntry). */
  clearMessages: (word: string, cognitive?: CognitiveMode) => void
  clearAll: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messagesByWord: {},

      getMessages: (word, cognitive = 'lookup') => {
        const key = cognitiveCacheKey(word, cognitive)
        const map = get().messagesByWord
        // Legacy: un-normalized raw key only applies to Lookup track
        if (cognitive === 'lookup') {
          return map[key] ?? map[word] ?? []
        }
        return map[key] ?? []
      },

      addMessage: (word, msg, cognitive = 'lookup') => {
        const key = cognitiveCacheKey(word, cognitive)
        if (!key) return
        set((state) => {
          let existing = state.messagesByWord[key] ?? []
          // Merge legacy un-normalized key into Lookup track
          if (cognitive === 'lookup' && word !== key && state.messagesByWord[word]) {
            existing = existing.length > 0 ? existing : state.messagesByWord[word]
          }
          const updated = {
            ...state.messagesByWord,
            [key]: [...existing, msg],
          }
          if (cognitive === 'lookup' && word !== key) delete updated[word]

          const keys = Object.keys(updated)
          if (keys.length > CHAT_WORD_LIMIT) {
            delete updated[keys[0]]
          }

          return { messagesByWord: updated }
        })
      },

      clearMessages: (word, cognitive) => {
        const normalized = normalizeQuery(word)
        set((state) => {
          const next = { ...state.messagesByWord }
          if (cognitive) {
            delete next[cognitiveCacheKey(word, cognitive)]
            if (cognitive === 'lookup') {
              delete next[word]
              delete next[normalized]
            }
          } else {
            delete next[cognitiveCacheKey(word, 'lookup')]
            delete next[cognitiveCacheKey(word, 'core')]
            delete next[word]
            delete next[normalized]
          }
          return { messagesByWord: next }
        })
      },

      clearAll: () => {
        set({ messagesByWord: {} })
      },
    }),
    { name: 'lexicon-chat' }
  )
)
