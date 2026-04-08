import { create } from 'zustand'
import type { Mode, QueryType, SuggestItem } from '../types'

export function detectQueryType(input: string): QueryType {
  const trimmed = input.trim()
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
