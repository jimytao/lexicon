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
    <div className="relative group">
      <div 
        ref={containerRef} 
        className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : 'scale-100'}`}
      >
        <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-300 shadow-sm
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
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search a word or phrase…"
            className="flex-1 text-base font-medium outline-none bg-transparent text-foreground placeholder-foreground-muted/50"
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
          
          {query && (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
              <button 
                onClick={() => { setQuery(''); setActiveIndex(-1) }} 
                className="p-1 rounded-full hover:bg-foreground/5 text-foreground-muted transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={() => { setSuggestions([]); setActiveIndex(-1); onForceAi?.(query.trim()) }}
                className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded-lg bg-accent text-white hover:bg-accent/90 transition-all shadow-sm"
                title="AI Query (Ctrl+Enter)"
              >
                AI
              </button>
            </div>
          )}
        </div>

        {/* Suggestion Dropdown - Floating style */}
        {(showSuggestions || showHistory) && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
            <SuggestList
              items={suggestions}
              onSelect={handleSelect}
              visible={showSuggestions}
              activeIndex={activeIndex}
            />
            {showHistory && <HistoryList onSelect={handleSelect} />}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <ModeToggle mode={mode} onModeChange={setMode} />
      </div>
    </div>
  )
}
