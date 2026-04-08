import { useRef, useCallback } from 'react'
import { useResultStore } from '../stores/resultStore'
import { analyzeWord, aiFullLookup, aiPhraseQuery } from '../services/ai'
import type { Meaning } from '../types'

export function useAiLookup() {
  const {
    setAiStatus, setAiAnalysis, setAiFullResult, setPhraseResult, setAiError,
    getCachedAi, getCachedAiFull, getCachedPhrase,
  } = useResultStore()
  const abortRef = useRef<AbortController | null>(null)

  /** Standard AI analysis for a word that exists in the dictionary */
  const trigger = useCallback(async (word: string, meanings: Meaning[]) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const cached = getCachedAi(word)
    if (cached) { setAiAnalysis(word, cached); return }

    setAiStatus('loading')
    try {
      const analysis = await analyzeWord(word, meanings, abortRef.current.signal)
      setAiAnalysis(word, analysis)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setAiError((e as Error).message)
    }
  }, [getCachedAi, setAiAnalysis, setAiStatus, setAiError])

  /** AI full lookup for a word NOT in the dictionary */
  const triggerFullLookup = useCallback(async (word: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const cached = getCachedAiFull(word)
    if (cached) { setAiFullResult(word, cached); return }

    setAiStatus('loading')
    try {
      const result = await aiFullLookup(word, abortRef.current.signal)
      setAiFullResult(word, result)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setAiError((e as Error).message)
    }
  }, [getCachedAiFull, setAiFullResult, setAiStatus, setAiError])

  /** AI phrase/sentence query */
  const triggerPhraseQuery = useCallback(async (phrase: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const cached = getCachedPhrase(phrase)
    if (cached) { setPhraseResult(phrase, cached); return }

    setAiStatus('loading')
    try {
      const result = await aiPhraseQuery(phrase, abortRef.current.signal)
      setPhraseResult(phrase, result)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setAiError((e as Error).message)
    }
  }, [getCachedPhrase, setPhraseResult, setAiStatus, setAiError])

  return { trigger, triggerFullLookup, triggerPhraseQuery }
}
