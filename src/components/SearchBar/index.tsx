import { useRef, useState } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useResultStore } from '../../stores/resultStore'
import { SuggestList } from '../SuggestList'
import { HistoryList } from './HistoryList'
import type { SuggestItem } from '../../types'
import { normalizeQuery } from '../../utils/text'
import { useT } from '../../i18n'

interface SearchBarProps {
  onWordSelect: (word: string) => void
  onHistorySelect: (word: string) => void
  onForceAi?: (word: string) => void
}

export function SearchBar({ onWordSelect, onHistorySelect, onForceAi }: SearchBarProps) {
  const t = useT()
  const { query, suggestions, setQuery, setSuggestions } = useSearchStore()
  const { historyEnabled } = useSettingsStore()
  const { words: historyWords } = useHistoryStore()
  const { aiCache, aiFullCache, phraseCache } = useResultStore()
  const containerRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestRequestRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const trimmedQuery = query.trim()

  const showSuggestions = suggestions.length > 0
  const showHistory = historyEnabled && isFocused && !trimmedQuery && !showSuggestions

  // The suggestion triggering is now centralized in useSearch hook
  // to avoid redundant DB calls and race conditions.

  // Build enriched suggest items: mark DB hits that have AI cache
  // and append history-miss items (in history but not in DB results)
  const enrichedSuggestions: (SuggestItem & { hasAiCache?: boolean; historyOnly?: boolean })[] = suggestions.map(item => ({
    ...item,
    hasAiCache: !!(aiCache[item.word] || aiFullCache[item.word] || phraseCache[item.word]),
  }))

  // Append history-miss items that match the current prefix (not already in DB results)
  if (trimmedQuery && historyEnabled) {
    const dbWords = new Set(suggestions.map(s => normalizeQuery(s.word)))
    const lq = normalizeQuery(trimmedQuery)
    for (const entry of historyWords) {
      const w = entry.word
      const nw = normalizeQuery(w)
      if (nw.startsWith(lq) && !dbWords.has(nw)) {
        enrichedSuggestions.push({
          word: w,
          zhBrief: '',
          hasAiCache: !!(aiCache[w] || aiFullCache[w] || phraseCache[w]),
          historyOnly: true,
        })
        if (enrichedSuggestions.length >= 20) break
      }
    }
  }

  function handleSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    inputRef.current?.blur()
    onWordSelect(word)
  }

  function handleHistoryItemSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    inputRef.current?.blur()
    onHistorySelect(word)
  }

  function handleSuggestSelect(word: string, isHistoryOnly: boolean) {
    if (isHistoryOnly) {
      handleHistoryItemSelect(word)
    } else {
      handleSelect(word)
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const finalQuery = query.trim()
    if (!finalQuery) return

    if (activeIndex >= 0) {
      const item = enrichedSuggestions[activeIndex]
      if (item) {
        item.historyOnly ? handleHistoryItemSelect(item.word) : handleSelect(item.word)
        return
      }
    }

    // Use raw query as primary target to preserve user intent (especially for AI analysis)
    handleSelect(finalQuery)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setActiveIndex(-1)
    if (!e.target.value.trim()) {
      suggestRequestRef.current += 1
      setSuggestions([])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, enrichedSuggestions.length - 1))
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
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-full border transition-all duration-300 shadow-sm overflow-hidden
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
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 min-w-0 text-base font-medium outline-none bg-transparent text-foreground placeholder-foreground-muted/50"
            onFocus={(e) => {
              setIsFocused(true)
              e.target.select()
            }}
            onBlur={() => {
              suggestRequestRef.current += 1
              setTimeout(() => setIsFocused(false), 200)
            }}
          />

          <div className={`flex shrink-0 items-center gap-2 p-1 rounded-full border transition-all duration-300 ${query.trim() ? 'bg-foreground/5 border-foreground/5' : 'bg-foreground/5 border-transparent'}`}>
            {query && (
              <button
                type="button"
                onClick={() => { suggestRequestRef.current += 1; setSuggestions([]); setQuery(''); setActiveIndex(-1); inputRef.current?.focus() }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-foreground/5 text-foreground-muted transition-colors animate-in fade-in zoom-in duration-200"
                aria-label={t('search.clear')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 ${query.trim()
                    ? 'text-accent hover:bg-accent/10 active:scale-90 opacity-100'
                    : 'text-foreground-muted/20 opacity-40 cursor-default'
                  }`}
                title={t('search.forceAi')}
                aria-label={t('search.forceAi')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </button>

              <div className={`w-[1px] h-4 bg-foreground/10 mx-1 transition-opacity duration-300 ${query.trim() ? 'opacity-100' : 'opacity-0'}`} />

              <button
                type="submit"
                disabled={!query.trim()}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-500 ${query.trim()
                    ? 'bg-accent text-white shadow-md shadow-accent/20 active:scale-95 translate-x-0 opacity-100'
                    : 'bg-foreground/5 text-foreground-muted/20 translate-x-0 opacity-40 cursor-default'
                  }`}
                aria-label={t('search.submit')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Suggestion Dropdown */}
        {(enrichedSuggestions.length > 0 || showHistory) && isFocused && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 overflow-hidden rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
            <SuggestList
              items={enrichedSuggestions}
              onSelect={handleSuggestSelect}
              visible={showSuggestions || (isFocused && !!trimmedQuery && enrichedSuggestions.length > 0)}
              activeIndex={activeIndex}
            />
            {showHistory && (
              <div onMouseDown={(e) => e.preventDefault()}>
                <HistoryList onSelect={handleHistoryItemSelect} />
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
