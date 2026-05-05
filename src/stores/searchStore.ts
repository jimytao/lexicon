import { create } from 'zustand'
import type { Mode, QueryType, SuggestItem, Language } from '../types'

export function detectLanguage(input: string): Language {
  const trimmed = input.trim()
  if (!trimmed) return 'en'
  
  // Korean: Hangul
  if (/[\uAC00-\uD7AF]/.test(trimmed)) return 'ko'
  
  // Japanese: Hiragana, Katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed)) return 'ja'
  
  // Chinese: CJK Unified Ideographs
  // Note: Japanese also uses Kanji, so we check for Kana first.
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return 'zh'
  
  // English: Latin letters
  if (/[a-zA-Z]/.test(trimmed)) return 'en'
  
  return 'other'
}

export function detectQueryType(input: string): QueryType {
  const trimmed = input.trim()
  const lang = detectLanguage(trimmed)
  
  if (lang === 'zh' || lang === 'ja' || lang === 'ko') {
    if (trimmed.length >= 10) return 'sentence'
    if (trimmed.length >= 4) return 'phrase'
    return 'word'
  }

  if (/[.?!,]/.test(trimmed) || trimmed.split(/\s+/).length >= 5) return 'sentence'
  if (trimmed.includes(' ')) return 'phrase'
  return 'word'
}

interface SearchStore {
  query: string
  queryType: QueryType
  suggestions: SuggestItem[]
  mode: Mode
  setQuery: (q: string) => void
  setQueryType: (t: QueryType) => void
  setMode: (m: Mode) => void
  setSuggestions: (s: SuggestItem[]) => void
  clear: () => void
}

export const useSearchStore = create<SearchStore>((set) => ({
  query: '',
  queryType: 'word',
  suggestions: [],
  mode: 'instant',
  setQuery: (query) => set({ query, queryType: detectQueryType(query) }),
  setQueryType: (queryType) => set({ queryType }),
  setMode: (mode) => set({ mode }),
  setSuggestions: (suggestions) => set({ suggestions }),
  clear: () => set({ query: '', queryType: 'word', suggestions: [] }),
}))
