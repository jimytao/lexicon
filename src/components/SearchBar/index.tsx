import { useRef, useState } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { db } from '../../services/db'
import { SuggestList } from '../SuggestList'
import { HistoryList } from './HistoryList'

interface SearchBarProps {
  onWordSelect: (word: string) => void
  onForceAi?: (word: string) => void
}

export function SearchBar({ onWordSelect, onForceAi }: SearchBarProps) {
  const { query, suggestions, setQuery, setSuggestions } = useSearchStore()
  const { historyEnabled } = useSettingsStore()
  const containerRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)

  const showSuggestions = suggestions.length > 0
  const showHistory = historyEnabled && isFocused && !query && !showSuggestions

  function handleSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    inputRef.current?.blur()
    onWordSelect(word)
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return

    const word = activeIndex >= 0
      ? (suggestions[activeIndex]?.word ?? query.trim())
      : (suggestions[0]?.word ?? query.trim())
    
    handleSelect(word)
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
    }
  }

  return (
    <div className="relative group">
      <form 
        ref={containerRef} 
        onSubmit={handleSubmit}
        className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.01]' : 'scale-100'}`}
      >
        <div className={`flex items-center gap-3 px-4 py-3.5 rounded-3xl border transition-all duration-300 shadow-sm overflow-hidden
          ${isFocused 
            ? 'bg-background border-accent ring-4 ring-accent/10 shadow-lg' 
            : 'bg-background-soft border-border hover:border-foreground-muted/30'
          }`}
        >
          <svg 
            className={`w-5 h-5 shrink-0 transition-colors ${isFocused ? 'text-accent' : 'text-foreground-muted'}`} 
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search a word or phrase…"
            className="flex-1 min-w-0 text-base font-medium outline-none bg-transparent text-foreground placeholder-foreground-muted/50"
            onFocus={async (e) => {
              setIsFocused(true)
              e.target.select()
              if (query) {
                const results = await db.suggest(query)
                setSuggestions(results)
              }
            }}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          />
          
          <div className={`flex shrink-0 items-center gap-2 p-1 rounded-2xl border transition-all duration-300 ${query.trim() ? 'bg-foreground/5 border-foreground/5' : 'bg-foreground/5 border-transparent'}`}>
            {query && (
              <button 
                type="button"
                onClick={() => { setQuery(''); setActiveIndex(-1); inputRef.current?.focus() }} 
                className="p-1.5 rounded-xl hover:bg-foreground/5 text-foreground-muted transition-colors animate-in fade-in zoom-in duration-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  setSuggestions([])
                  onForceAi?.(query.trim())
                }}
                disabled={!query.trim()}
                className={`p-2 rounded-xl transition-all duration-300 ${
                  query.trim() 
                    ? 'text-accent hover:bg-accent/10 active:scale-90 opacity-100' 
                    : 'text-foreground-muted/20 opacity-40 cursor-default'
                }`}
                title="Force AI Search"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </button>

              <div className={`w-[1px] h-4 bg-foreground/10 mx-1 transition-opacity duration-300 ${query.trim() ? 'opacity-100' : 'opacity-0'}`} />

              <button
                type="submit"
                disabled={!query.trim()}
                className={`p-2 rounded-xl transition-all duration-500 ${
                  query.trim() 
                    ? 'bg-accent text-white shadow-md shadow-accent/20 active:scale-95 translate-x-0 opacity-100' 
                    : 'bg-foreground/5 text-foreground-muted/20 translate-x-0 opacity-40 cursor-default'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Suggestion Dropdown */}
        {(showSuggestions || showHistory) && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
            <SuggestList
              items={suggestions}
              onSelect={handleSelect}
              visible={showSuggestions}
              activeIndex={activeIndex}
            />
            {showHistory && (
              <div onMouseDown={(e) => e.preventDefault()}>
                <HistoryList onSelect={handleSelect} />
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
