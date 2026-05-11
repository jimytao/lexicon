import { useEffect, useCallback, useRef } from 'react'
import { useSearchStore, detectQueryType } from '../stores/searchStore'
import { useResultStore } from '../stores/resultStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useHistoryStore } from '../stores/historyStore'
import { db } from '../services/db'

export function useSearch() {
  const { query, setQuery, setSuggestions, mode, setMode } = useSearchStore()
  const { setWordResult, setRelatedPhrases } = useResultStore()
  const { historyEnabled } = useSettingsStore()
  const { add: addToHistory } = useHistoryStore()
  const skipNextSuggestRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 1) { setSuggestions([]); return }
      if (skipNextSuggestRef.current) {
        skipNextSuggestRef.current = false
        return
      }
      const results = await db.suggest(query)
      setSuggestions(results)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, setSuggestions])

  const selectWord = useCallback(async (word: string) => {
    skipNextSuggestRef.current = true
    const queryType = detectQueryType(word)

    // Optimistic history write: make latest searched word visible immediately,
    // then branch-specific writes can upgrade aiMode when needed.
    if (historyEnabled) addToHistory(word, null)

    if (queryType === 'sentence') {
      // Sentence → always AI phrase query, no db lookup
      setWordResult(null)
      setRelatedPhrases([])
      setSuggestions([])
      setQuery(word)
      setMode('ai')
      if (historyEnabled) addToHistory(word, 'phrase')
      return { result: null, mode: 'ai' as const, queryType }
    }

    if (queryType === 'phrase') {
      // Phrase → try db first, fallback to AI
      const [result, phrases] = await Promise.all([
        db.lookup(word),
        db.getRelatedPhrases(word),
      ])
      if (result) {
        setWordResult(result)
        setRelatedPhrases(phrases)
        setSuggestions([])
        setQuery(word)
        return { result, mode, queryType }
      }
      // No db result → AI phrase query
      setWordResult(null)
      setRelatedPhrases([])
      setSuggestions([])
      setQuery(word)
      setMode('ai')
      if (historyEnabled) addToHistory(word, 'phrase')
      return { result: null, mode: 'ai' as const, queryType }
    }

    // Word type
    const [result, phrases] = await Promise.all([
      db.lookup(word),
      db.getRelatedPhrases(word),
    ])

    if (result) {
      setWordResult(result)
      setRelatedPhrases(phrases)
      setSuggestions([])
      setQuery(word)
      return { result, mode, queryType }
    }

    // Word not in db → AI full lookup
    setWordResult(null)
    setRelatedPhrases([])
    setSuggestions([])
    setQuery(word)
    setMode('ai')
    if (historyEnabled) addToHistory(word, 'full')
    return { result: null, mode: 'ai' as const, queryType }
  }, [mode, historyEnabled, addToHistory, setWordResult, setRelatedPhrases, setSuggestions, setQuery, setMode])

  return { query, setQuery, selectWord }
}
