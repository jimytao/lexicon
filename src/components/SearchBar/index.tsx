import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchStore } from '../../stores/searchStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useResultStore } from '../../stores/resultStore'
import { SuggestList } from '../SuggestList'
import { HistoryList } from './HistoryList'
import type { SuggestItem } from '../../types'
import { normalizeQuery, hasAnyAiCacheEntry } from '../../utils/text'
import { createCancelableDelay } from '../../utils/cancelableDelay'
import { useComposerFlowLayout } from '../../hooks/useComposerFlowLayout'
import { useT } from '../../i18n'

interface SearchBarProps {
  onWordSelect: (word: string) => void
  onHistorySelect: (word: string) => void
  onForceAi?: (word: string) => void
}

export function SearchBar({ onWordSelect, onHistorySelect, onForceAi }: SearchBarProps) {
  const t = useT()
  const { query, suggestions, learningDirection, setQuery, setSuggestions, setLearningDirection } = useSearchStore()
  const { historyEnabled } = useSettingsStore()
  const { words: historyWords } = useHistoryStore()
  const { aiCache, aiFullCache, phraseCache } = useResultStore()
  const containerRef = useRef<HTMLFormElement>(null)
  const suggestRequestRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const blurDelayRef = useRef<ReturnType<typeof createCancelableDelay> | null>(null)
  if (!blurDelayRef.current) blurDelayRef.current = createCancelableDelay()
  const trimmedQuery = query.trim()
  const selectedDirectionLabel = learningDirection === 'in' ? 'IN' : 'OUT'
  const displayedDirection = learningDirection
  const displayedDirectionLabel = displayedDirection === 'in' ? 'IN' : 'OUT'

  // gap-3 of clearance from the buttons; 110px ≈ 4 lines before the text scrolls.
  // Once the caret leaves, a tall composer is just wasted space over the results —
  // collapse it back to one line until the user comes back to edit.
  const { textareaRef, mirrorRef, actionsRef, containerRef: pillRef, reserveHeight, isMultiLine, isCollapsed } =
    useComposerFlowLayout(query, { gap: 12, maxHeight: 110, collapsed: !isFocused })
  const composerAlignment = isMultiLine && !isCollapsed ? 'items-start' : 'items-center'

  useEffect(() => () => blurDelayRef.current?.cancel(), [])

  // Runs after the layout hook has re-expanded the textarea in this same commit, so the
  // caret lands in text that is actually laid out and the scroll sticks.
  const resumeAtEndRef = useRef(false)
  useLayoutEffect(() => {
    if (!isFocused || !resumeAtEndRef.current) return
    resumeAtEndRef.current = false
    const el = textareaRef.current
    if (!el) return
    el.setSelectionRange(el.value.length, el.value.length)
    el.scrollTop = el.scrollHeight
  }, [isFocused, textareaRef])

  const showSuggestions = suggestions.length > 0
  const showHistory = historyEnabled && isFocused && !trimmedQuery && !showSuggestions

  // Build enriched suggest items: mark DB hits that have AI cache
  // and append history-miss items (in history but not in DB results)
  const enrichedSuggestions: (SuggestItem & { hasAiCache?: boolean; historyOnly?: boolean })[] = suggestions.map(item => ({
    ...item,
    hasAiCache: hasAnyAiCacheEntry(item.word, aiCache, aiFullCache, phraseCache),
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
          hasAiCache: hasAnyAiCacheEntry(w, aiCache, aiFullCache, phraseCache),
          historyOnly: true,
        })
        if (enrichedSuggestions.length >= 20) break
      }
    }
  }

  function handleSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    textareaRef.current?.blur()
    onWordSelect(word)
  }

  function handleHistoryItemSelect(word: string) {
    setSuggestions([])
    setActiveIndex(-1)
    setQuery(word)
    textareaRef.current?.blur()
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
    // Read the DOM value first: a rapid final keystroke + Enter can arrive
    // before React has committed the controlled state update.
    const finalQuery = (textareaRef.current?.value ?? query).trim()
    if (!finalQuery) return

    if (activeIndex >= 0) {
      const item = enrichedSuggestions[activeIndex]
      if (item) {
        if (item.historyOnly) {
          handleHistoryItemSelect(item.word)
        } else {
          handleSelect(item.word)
        }
        return
      }
    }

    // Use raw query as primary target to preserve user intent (especially for AI analysis)
    handleSelect(finalQuery)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuery(e.target.value)
    setActiveIndex(-1)
    if (!e.target.value.trim()) {
      suggestRequestRef.current += 1
      setSuggestions([])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter confirms an IME candidate while composition is active; it must
      // not also submit a stale/partial query.
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      handleSubmit()
      return
    }

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
        <div ref={pillRef} className={`relative flex ${composerAlignment} gap-3 px-4 py-2 min-h-[52px] border transition-all duration-300 shadow-sm overflow-hidden ${
          isMultiLine && !isCollapsed ? 'rounded-2xl' : 'rounded-full'
        } ${
          isFocused
            ? 'bg-background border-accent ring-4 ring-accent/10 shadow-lg'
            : 'bg-background-soft border-border hover:border-foreground-muted/30'
        }`}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLearningDirection(learningDirection === 'in' ? 'out' : 'in')
              textareaRef.current?.focus()
            }}
            className="w-[58px] h-10 -ml-1 shrink-0 inline-flex items-center justify-center gap-1 rounded-full text-[11px] font-bold tracking-wide transition-all duration-200 bg-accent/10 text-accent hover:bg-accent/15 active:scale-95"
            title={t('search.directionToggle').replace('{direction}', selectedDirectionLabel)}
            aria-label={t('search.directionToggle').replace('{direction}', selectedDirectionLabel)}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
              {displayedDirection === 'in' ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 21h14" />
                </>
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21V9m0 0 4 4m-4-4-4 4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14" />
                </>
              )}
            </svg>
            <span>{displayedDirectionLabel}</span>
          </button>

          {/* The text always wraps at the full width — the buttons float over the
              bottom-right corner, so they can only ever obstruct the last line. When
              they would, `reserveHeight` opens one empty line beneath the text for them. */}
          <div className="relative flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              rows={1}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={t('search.placeholder')}
              className="block w-full text-base font-medium outline-none bg-transparent text-foreground placeholder-foreground-muted/50 resize-none overflow-y-auto no-scrollbar leading-normal py-1"
              onFocus={(e) => {
                blurDelayRef.current?.cancel()
                // Coming back to a collapsed long query: resume at the end of the text
                // instead of selecting it all, which would leave the whole thing one
                // keystroke away from being wiped. Deferred — the caret can only be
                // placed once the composer has expanded back to its full height.
                if (isCollapsed) resumeAtEndRef.current = true
                else e.target.select()
                setIsFocused(true)
              }}
              onBlur={() => {
                suggestRequestRef.current += 1
                blurDelayRef.current?.schedule(() => {
                  if (document.activeElement === textareaRef.current) return
                  setIsFocused(false)
                }, 200)
              }}
            />
            <div aria-hidden style={{ height: reserveHeight }} />
            <div ref={mirrorRef} aria-hidden className="absolute top-0 left-0 invisible pointer-events-none" />
          </div>

          <div
            ref={actionsRef}
            className={`absolute right-4 bottom-2 flex shrink-0 items-center gap-1 rounded-full border transition-all duration-300 ${query.trim() ? 'bg-foreground/5 border-foreground/5' : 'bg-foreground/5 border-transparent'}`}
          >
            {query && (
              <button
                type="button"
                onClick={() => { suggestRequestRef.current += 1; setSuggestions([]); setQuery(''); setActiveIndex(-1); textareaRef.current?.focus() }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/5 text-foreground-muted transition-colors animate-in fade-in zoom-in duration-200"
                aria-label={t('search.clear')}
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
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 ${query.trim()
                    ? 'text-accent hover:bg-accent/10 active:scale-90 opacity-100'
                    : 'text-foreground-muted/20 opacity-40 cursor-default'
                  }`}
                title={`${t('search.forceAi')} — ${t('search.forceAiHint')}`}
                aria-label={t('search.forceAi')}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </button>

              <div className={`w-[1px] h-4 bg-foreground/10 mx-0.5 transition-opacity duration-300 ${query.trim() ? 'opacity-100' : 'opacity-0'}`} />

              <button
                type="submit"
                disabled={!query.trim()}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-500 ${query.trim()
                    ? 'bg-accent text-white shadow-md shadow-accent/20 active:scale-95 translate-x-0 opacity-100'
                    : 'bg-foreground/5 text-foreground-muted/20 translate-x-0 opacity-40 cursor-default'
                  }`}
                aria-label={t('search.submit')}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
