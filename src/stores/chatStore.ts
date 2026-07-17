import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types'

const CHAT_WORD_LIMIT = 100 // 最多保留 100 个词条的 chat 历史

interface ChatStore {
  messagesByWord: Record<string, ChatMessage[]>
  getMessages: (word: string) => ChatMessage[]
  addMessage: (word: string, msg: ChatMessage) => void
  clearMessages: (word: string) => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messagesByWord: {},

      getMessages: (word) => {
        return get().messagesByWord[word] ?? []
      },

      addMessage: (word, msg) => {
        set((state) => {
          const existing = state.messagesByWord[word] ?? []
          const updated = {
            ...state.messagesByWord,
            [word]: [...existing, msg],
          }

          // LRU 裁剪：超出上限时删除最老的词条
          const keys = Object.keys(updated)
          if (keys.length > CHAT_WORD_LIMIT) {
            delete updated[keys[0]]
          }

          return { messagesByWord: updated }
        })
      },

      clearMessages: (word) => {
        set((state) => {
          const next = { ...state.messagesByWord }
          delete next[word]
          return { messagesByWord: next }
        })
      },
    }),
    { name: 'lexicon-chat' }
  )
)
