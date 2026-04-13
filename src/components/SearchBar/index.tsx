import { useRef, useState } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { db } from '../../services/db'
import { SuggestList } from '../SuggestList'
import { HistoryList } from './HistoryList'
import { ModeToggle } from './ModeToggle'

interface SearchBarProps {
  onWordSelect: (word: string) => void
  onForceAi?: (query: string) => void
}

export function SearchBar({ onWordSelect, onForceAi }: SearchBarProps) {
  const { query, suggestions, mode, setQuery, setMode, setSuggestions } = useSearchStore()
  const { historyEnabled } = useSettingsStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)

  const showSuggestions = suggestions.length > 0
  const showHistory = historyEnabled && isFocused && !query && !showSuggestions

  function handleSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    onWordSelect(word)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      if (suggestions.length > 0) {
        setSuggestions([])
        setActiveIndex(-1)
      } else {
        setQuery('')
      }
    } else if (e.key === 'Enter' && query.trim()) {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter / Cmd+Enter：强制 AI 查询，跳过备选项
        setSuggestions([])
        setActiveIndex(-1)
        onForceAi?.(query.trim())
      } else {
        const word = activeIndex >= 0
          ? (suggestions[activeIndex]?.word ?? query.trim())
          : (suggestions[0]?.word ?? query.trim())
        handleSelect(word)
      }
    }
  }

  return (
    <div className="px-4 pt-4 pb-2">
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 shadow-sm focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-400/20 transition-all">
          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search a word…"
            className="flex-1 text-sm outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            onFocus={async (e) => {
              setIsFocused(true)
              e.target.select()
              if (query) {
                const results = await db.suggest(query)
                setSuggestions(results)
              }
            }}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          />
          {query && (
            <button onClick={() => { setQuery(''); setActiveIndex(-1) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <SuggestList
          items={suggestions}
          onSelect={handleSelect}
          visible={showSuggestions}
          activeIndex={activeIndex}
        />
        {showHistory && <HistoryList onSelect={handleSelect} />}
      </div>

      <div className="flex items-center justify-between mt-2">
        <ModeToggle mode={mode} onModeChange={setMode} />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { if (query.trim()) { const word = suggestions[0]?.word ?? query.trim(); handleSelect(word) } }}
            className="px-3 py-1 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => { if (query.trim()) { setSuggestions([]); setActiveIndex(-1); onForceAi?.(query.trim()) } }}
            className="px-3 py-1 rounded-full text-xs font-medium text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            title="强制 AI 查询（或 Ctrl+Enter）"
          >
            AI Search
          </button>
        </div>
      </div>
    </div>
  )
}
