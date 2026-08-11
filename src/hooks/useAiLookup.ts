import { useRef, useCallback } from 'react'
import { useResultStore } from '../stores/resultStore'
import { useSearchStore } from '../stores/searchStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  analyzeWord,
  aiFullLookup,
  aiPhraseQuery,
  aiCombinedLookup,
  aiCombinedPhraseQuery,
  fillMissingCollocationNotes,
  fillMissingConceptExamples,
} from '../services/ai'
import { recordSentenceCorrectionEvent } from '../services/profile'
import { combineSignals } from '../utils/abortSignal'
import { classifyAiRequestError } from '../utils/aiRequestErrors'
import { createAiRequestGate, shouldCommitAiDisplay } from '../utils/aiRequestGate'
import { cognitiveFromSearchMode, normalizeQuery } from '../utils/text'
import { aiFullNeedsExplanationFill, collocationsNeedFill, conceptGraphNeedsFill } from '../utils/aiCompleteness'
import type { Meaning, CollocationData, ConceptGraph, ConceptGraphExample } from '../types'
import type { SearchTag } from '../utils/combinedResult'

function mergeCollocationNotes(
  data: CollocationData | undefined,
  filled: Array<{ chunk: string; note: string; spatialExtension?: string }>
): CollocationData | undefined {
  if (!data) return data
  const map = new Map(filled.map((f) => [f.chunk.toLowerCase(), f]))
  const patch = (list: typeof data.chunks) =>
    list.map((item) => {
      const f = map.get(item.chunk.toLowerCase())
      if (!f) return item
      return {
        ...item,
        note: f.note || item.note,
        spatialExtension: f.spatialExtension ?? item.spatialExtension,
      }
    })
  return {
    chunks: patch(data.chunks ?? []),
    collocations: patch(data.collocations ?? []),
  }
}

function mergeConceptExamples(
  graph: ConceptGraph | undefined,
  filled: Array<{ phrase: string; meaning: string; mindHint: string }>
): ConceptGraph | undefined {
  if (!graph) return graph
  const map = new Map(filled.map((f) => [f.phrase.toLowerCase(), f]))
  return {
    ...graph,
    branches: graph.branches.map((b) => ({
      ...b,
      examples: (b.examples ?? []).map((raw) => {
        const phrase = typeof raw === 'string' ? raw : raw.phrase
        const f = map.get(phrase.toLowerCase())
        if (!f) return raw
        const base: ConceptGraphExample = typeof raw === 'string'
          ? { phrase, meaning: '', mindHint: '' }
          : { ...raw }
        return {
          ...base,
          meaning: f.meaning || base.meaning,
          mindHint: f.mindHint || base.mindHint,
        }
      }),
    })),
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function useAiLookup() {
  const {
    setAiStatus, setAiAnalysis, setAiFullResult, setPhraseResult, setAiError,
    getCachedAi, getCachedAiFull, getCachedPhrase,
    setCombinedResult, setCombinedPhraseResult, getCachedCombined, getCachedCombinedPhrase,
  } = useResultStore()
  const abortRef = useRef<AbortController | null>(null)
  const gateRef = useRef(createAiRequestGate())
  const silentRetryKeys = useRef<Set<string>>(new Set())

  const cancelAi = useCallback(() => {
    gateRef.current.cancel()
    abortRef.current?.abort()
  }, [])

  /** Standard AI analysis for a word that exists in the dictionary */
  const trigger = useCallback(async (word: string, meanings: Meaning[], includeExamples = false) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()

    const cached = getCachedAi(word)
    if (cached && (!includeExamples || (cached.examples?.length ?? 0) > 0)) {
      if (shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) {
        setAiAnalysis(word, cached)
      }
      return
    }

    setAiStatus('loading')
    try {
      const analysis = await analyzeWord(word, meanings, includeExamples, abortRef.current.signal)
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setAiAnalysis(word, analysis)
    } catch (e) {
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, abortRef.current?.signal.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${word}」请求超时，请重试或检查网络`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedAi, setAiAnalysis, setAiStatus, setAiError])

  /** AI full lookup — Lookup vs Pure Core use separate prompts + caches; silent retry once if explanations missing */
  const triggerFullLookup = useCallback(async (word: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()

    const cognitive = cognitiveFromSearchMode(useSearchStore.getState().mode)
    const cached = getCachedAiFull(word, cognitive)
    if (cached) {
      if (shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) {
        setAiFullResult(word, cached, cognitive)
      }
      return
    }

    const { signal: combined, dispose } = combineSignals(abortRef.current.signal, 30_000)
    const retryKey = `${normalizeQuery(word)}::full::${cognitive}`
    const wordGraphEnabled = useSettingsStore.getState().coreModules?.some(
      (m) => m.id === 'wordGraph' && m.enabled
    ) ?? true

    setAiStatus('loading')
    try {
      let result = await aiFullLookup(word, true, combined, cognitive)

      if (
        aiFullNeedsExplanationFill(result, cognitive, { wordGraphEnabled })
        && !silentRetryKeys.current.has(retryKey)
      ) {
        silentRetryKeys.current.add(retryKey)
        dispose()
        const retry = combineSignals(abortRef.current.signal, 30_000)
        try {
          result = await aiFullLookup(word, true, retry.signal, cognitive)
        } finally {
          retry.dispose()
        }
      } else {
        dispose()
      }

      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setAiFullResult(word, result, cognitive)
    } catch (e) {
      dispose()
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, combined.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${word}」较为生僻，AI 30 秒内未能解析，建议直接向 AI 提问`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedAiFull, setAiFullResult, setAiStatus, setAiError])

  /** AI phrase/sentence query — Lookup vs Pure Core use separate prompts + caches */
  const triggerPhraseQuery = useCallback(async (phrase: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()

    const cognitive = cognitiveFromSearchMode(useSearchStore.getState().mode)
    const cached = getCachedPhrase(phrase, cognitive)
    if (cached) {
      if (shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) {
        setPhraseResult(phrase, cached, cognitive)
      }
      return
    }

    setAiStatus('loading')
    try {
      const result = await aiPhraseQuery(phrase, true, abortRef.current.signal, cognitive)
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setPhraseResult(phrase, result, cognitive)
      if (result.unnaturalMindModel || result.correctForm) {
        recordSentenceCorrectionEvent(phrase, result.correctForm, result.unnaturalMindModel)
      }
    } catch (e) {
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, abortRef.current?.signal.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${phrase}」请求超时，请重试或检查网络`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedPhrase, setPhraseResult, setAiStatus, setAiError])

  /** v0.9.0: Combined AI call — fetches Lookup + Core in one round-trip. */
  const triggerCombinedLookup = useCallback(async (word: string, forceRefresh = false, tag: SearchTag = 'normal') => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()

    if (!forceRefresh) {
      const cached = getCachedCombined(word, tag)
      if (cached) {
        if (shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) {
          setCombinedResult(word, cached, tag)
        }
        return
      }
    }

    const { signal: combined, dispose } = combineSignals(abortRef.current.signal, 30_000)

    setAiStatus('loading')
    try {
      const result = await aiCombinedLookup(word, true, combined)
      dispose()
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setCombinedResult(word, result, tag)
    } catch (e) {
      dispose()
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, combined.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${word}」较为生僻，AI 30 秒内未能解析，建议直接向 AI 提问`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedCombined, setCombinedResult, setAiStatus, setAiError])

  /** v0.9.0: Combined phrase AI call — fetches Lookup + Core phrase results in one round-trip. */
  const triggerCombinedPhraseQuery = useCallback(async (phrase: string, forceRefresh = false, tag: SearchTag = 'normal') => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()

    if (!forceRefresh) {
      const cached = getCachedCombinedPhrase(phrase, tag)
      if (cached) {
        if (shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) {
          setCombinedPhraseResult(phrase, cached, tag)
        }
        return
      }
    }

    setAiStatus('loading')
    try {
      const result = await aiCombinedPhraseQuery(phrase, true, abortRef.current.signal)
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setCombinedPhraseResult(phrase, result, tag)
    } catch (e) {
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, abortRef.current?.signal.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${phrase}」请求超时，请重试或检查网络`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedCombinedPhrase, setCombinedPhraseResult, setAiStatus, setAiError])

  /** Repair only missing collocation notes on current full result (keeps good notes). */
  const repairCollocationNotes = useCallback(async (word: string) => {
    const cognitive = cognitiveFromSearchMode(useSearchStore.getState().mode)
    const current = useResultStore.getState().aiFullResult
    if (!current?.collocations || !collocationsNeedFill(current.collocations)) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()
    const items = [
      ...(current.collocations.chunks ?? []),
      ...(current.collocations.collocations ?? []),
    ]
    try {
      const filled = await fillMissingCollocationNotes(word, items, abortRef.current.signal)
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const merged = {
        ...current,
        collocations: mergeCollocationNotes(current.collocations, filled),
      }
      setAiFullResult(word, merged, cognitive)
    } catch (e) {
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, abortRef.current?.signal.reason)
      if (kind === 'abort') return
      // Repair failures stay local to the card; avoid clobbering the main result status.
      console.warn('repairCollocationNotes failed', e)
    }
  }, [setAiFullResult])

  /** Repair only missing concept-graph example fields on current Core result. */
  const repairConceptExamples = useCallback(async (word: string) => {
    const cognitive = cognitiveFromSearchMode(useSearchStore.getState().mode)
    const current = useResultStore.getState().aiFullResult
    if (!current?.conceptGraph || !conceptGraphNeedsFill(current.conceptGraph)) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()
    const flat = current.conceptGraph.branches.flatMap((b) =>
      (b.examples ?? []).map((raw) =>
        typeof raw === 'string'
          ? { phrase: raw, meaning: '', mindHint: '' }
          : { phrase: raw.phrase, meaning: raw.meaning, mindHint: raw.mindHint }
      )
    )
    try {
      const filled = await fillMissingConceptExamples(
        word,
        current.conceptGraph.rootCore || word,
        flat,
        abortRef.current.signal
      )
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const merged = {
        ...current,
        conceptGraph: mergeConceptExamples(current.conceptGraph, filled),
      }
      setAiFullResult(word, merged, cognitive)
    } catch (e) {
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      const kind = classifyAiRequestError(e, abortRef.current?.signal.reason)
      if (kind === 'abort') return
      console.warn('repairConceptExamples failed', e)
    }
  }, [setAiFullResult])

  return {
    trigger,
    triggerFullLookup,
    triggerPhraseQuery,
    triggerCombinedLookup,
    triggerCombinedPhraseQuery,
    repairCollocationNotes,
    repairConceptExamples,
    cancelAi,
  }
}
