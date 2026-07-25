import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types'
import { normalizeQuery } from '../utils/text'

const CHAT_WORD_LIMIT = 100 // 最多保留 100 个词条的 chat 历史（与历史/AI 缓存对齐）

interface ChatStore {
  messagesByWord: Record<string, ChatMessage[]>
  getMessages: (word: string) => ChatMessage[]
  addMessage: (word: string, msg: ChatMessage) => void
  clearMessages: (word: string) => void
  clearAll: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messagesByWord: {},

      getMessages: (word) => {
        const normalized = normalizeQuery(word)
        const map = get().messagesByWord
        return map[normalized] ?? map[word] ?? []
      },

      addMessage: (word, msg) => {
        const normalized = normalizeQuery(word)
        if (!normalized) return
        set((state) => {
          // Merge legacy un-normalized key if present
          const legacy = state.messagesByWord[word] ?? []
          const existing = state.messagesByWord[normalized] ?? (word !== normalized ? legacy : [])
          const updated = {
            ...state.messagesByWord,
            [normalized]: [...existing, msg],
          }
          if (word !== normalized) delete updated[word]

          // LRU 裁剪：超出上限时删除最老的词条
          const keys = Object.keys(updated)
          if (keys.length > CHAT_WORD_LIMIT) {
            delete updated[keys[0]]
          }

          return { messagesByWord: updated }
        })
      },

      clearMessages: (word) => {
        const normalized = normalizeQuery(word)
        set((state) => {
          const next = { ...state.messagesByWord }
          delete next[normalized]
          delete next[word]
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
