import { useRef, useCallback } from 'react'
import { useResultStore } from '../stores/resultStore'
import { analyzeWord, aiFullLookup, aiPhraseQuery } from '../services/ai'
import type { Meaning } from '../types'

// AbortSignal.any() and AbortSignal.timeout() may be absent on older Android WebViews
function combineSignals(userSignal: AbortSignal, timeoutMs: number): AbortSignal {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(new DOMException('TimeoutError', 'TimeoutError')), timeoutMs)
  userSignal.addEventListener('abort', () => { clearTimeout(tid); ctrl.abort(userSignal.reason) }, { once: true })
  return ctrl.signal
}

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

    const combined = combineSignals(abortRef.current.signal, 30000)

    setAiStatus('loading')
    try {
      const result = await aiFullLookup(word, combined)
      setAiFullResult(word, result)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if ((e as Error).name === 'TimeoutError') {
        setAiError(`「${word}」较为生僻，AI 30 秒内未能解析，建议直接向 AI 提问`)
        return
      }
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
