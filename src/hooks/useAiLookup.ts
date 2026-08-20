import { useRef, useCallback } from 'react'
import { useResultStore } from '../stores/resultStore'
import { useSearchStore, detectQueryType, detectLanguage } from '../stores/searchStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  analyzeWord,
  aiFullLookup,
  aiPhraseQuery,
  performWebSearch,
  resolveQuerySkeleton,
  fillMissingCollocationNotes,
  fillMissingConceptExamples,
  type MeaningsAnchor,
} from '../services/ai'
import { recordSentenceCorrectionEvent } from '../services/profile'
import { combineSignals } from '../utils/abortSignal'
import { classifyAiRequestError } from '../utils/aiRequestErrors'
import { createAiRequestGate, shouldCommitAiDisplay } from '../utils/aiRequestGate'
import { cognitiveFromSearchMode, normalizeQuery } from '../utils/text'
import { aiFullNeedsExplanationFill, collocationsNeedFill, conceptGraphNeedsFill } from '../utils/aiCompleteness'
import type { Meaning, CollocationData, ConceptGraph, ConceptGraphExample, PhraseResult } from '../types'
import type { CombinedHalf } from '../stores/resultStore'
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

/**
 * Stage-1 policy for word queries.
 *
 * The anchor exists to stop the two parallel halves from explaining different
 * words. How much we are willing to pay for it depends on how ambiguous the
 * target actually is:
 *
 *   local dictionary hit  -> free, we already know the word and its senses
 *   Chinese input         -> genuinely ambiguous, worth a serial round trip
 *   everything else       -> the halves will agree on their own; resolve in the
 *                            background purely to paint something early
 *
 * The old code paid the serial round trip on every out-of-dictionary lookup,
 * which is why English lookups got slower without anyone seeing anything sooner.
 */
async function resolveWordAnchor(
  word: string,
  tag: SearchTag,
  signal: AbortSignal,
  commitOk: () => boolean,
): Promise<MeaningsAnchor | undefined> {
  const store = useResultStore.getState()

  // Force-AI (bypass) deliberately ignores the local entry — the user asked for
  // AI's own reading, and the displayed wordResult may even be a stale other word.
  if (tag !== 'bypass') {
    const wr = store.wordResult
    if (wr?.meanings?.length && normalizeQuery(wr.word) === normalizeQuery(word)) {
      return {
        correctForm: wr.word,
        pos: wr.pos,
        phonetic: wr.phonetic,
        senses: wr.meanings.slice(0, 5).map((m, i) => ({
          senseIndex: i + 1,
          zh: m.zh,
          en: m.en || undefined,
          pos: m.pos,
        })),
      }
    }
  }

  const isMono = useSettingsStore.getState().monolingualWord

  if (detectLanguage(word) === 'zh') {
    try {
      const skeleton = await resolveQuerySkeleton(word, 'word', isMono, signal)
      if (commitOk()) useResultStore.getState().applyQuerySkeleton(word, skeleton, 'word')
      return skeleton
    } catch (e) {
      // A real cancel must stop the whole request; a bad-JSON resolution must not.
      if (classifyAiRequestError(e, signal.reason) === 'abort') throw e
      return undefined
    }
  }

  void previewSkeleton(word, 'word', isMono, signal, commitOk)
  return undefined
}

/** Stage-1 policy for phrases/sentences: preview only, never blocking. */
async function resolvePhraseAnchor(
  phrase: string,
  signal: AbortSignal,
  commitOk: () => boolean,
): Promise<MeaningsAnchor | undefined> {
  const isSentence = detectQueryType(phrase) === 'sentence'
  const settings = useSettingsStore.getState()
  const isMono = isSentence ? settings.monolingualSentence : settings.monolingualPhrase

  // A sentence has exactly one faithful reading and the halves cannot diverge on
  // it, so there is nothing to arbitrate — resolve only to paint the gist early.
  void previewSkeleton(phrase, isSentence ? 'sentence' : 'phrase', isMono, signal, commitOk)
  return undefined
}

/**
 * Fire-and-forget early paint. Deliberately swallows every failure: this never
 * gates the real halves, and its signal is shared with them so it dies with them.
 */
function previewSkeleton(
  query: string,
  kind: 'word' | 'phrase' | 'sentence',
  isMono: boolean,
  signal: AbortSignal,
  commitOk: () => boolean,
): Promise<void> {
  return resolveQuerySkeleton(query, kind, isMono, signal)
    .then((skeleton) => {
      if (!commitOk()) return
      useResultStore.getState().applyQuerySkeleton(query, skeleton, kind === 'word' ? 'word' : 'phrase')
    })
    .catch(() => { /* preview only — the real halves carry the request */ })
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

  /**
   * v0.9.15: Split combined call.
   *
   * The single {lookup, core} mega-JSON was output-token bound and, being
   * non-streaming, could not paint anything until the whole thing landed. We now
   * run the two halves as independent parallel requests so whichever tab the user
   * is looking at renders as soon as its own half arrives.
   */
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

    const { signal, dispose } = combineSignals(abortRef.current.signal, 45_000)
    const commitOk = () => shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)
    const store = () => useResultStore.getState()
    store().beginCombined(word, tag, 'word')

    try {
      const anchor = await resolveWordAnchor(word, tag, signal, commitOk)

      // One shared web search instead of one per half (it used to run twice).
      const webResults = await performWebSearch(word, signal)

      const selected: CombinedHalf = cognitiveFromSearchMode(useSearchStore.getState().mode)
      const other: CombinedHalf = selected === 'lookup' ? 'core' : 'lookup'

      let landed = 0
      let lastError: unknown = null

      const runHalf = async (half: CombinedHalf) => {
        try {
          const r = await aiFullLookup(word, true, signal, half, { anchor, webResults })
          if (!commitOk()) { store().settleCombinedHalf(half); return }
          landed += 1
          store().commitCombinedHalf(word, half, r, tag)
        } catch (e) {
          lastError = e
          store().settleCombinedHalf(half)
        }
      }

      // Both fire immediately; the selected half is simply the one on screen, so it
      // is the one the user perceives. Ordering between them is not forced.
      await Promise.all([runHalf(selected), runHalf(other)])
      dispose()

      if (!commitOk()) return
      // Only a total failure is an error — one good half is still a usable result.
      if (landed === 0 && lastError) {
        const kind = classifyAiRequestError(lastError, signal.reason)
        if (kind === 'abort') return
        if (kind === 'timeout') {
          setAiError(`「${word}」较为生僻，AI 未能在时限内解析，建议直接向 AI 提问`)
          return
        }
        setAiError(errorMessage(lastError))
      }
    } catch (e) {
      dispose()
      if (!commitOk()) return
      const kind = classifyAiRequestError(e, signal.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${word}」较为生僻，AI 未能在时限内解析，建议直接向 AI 提问`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedCombined, setCombinedResult, setAiError])

  /** v0.9.15: Split combined phrase/sentence call — same two-parallel-halves shape. */
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

    const { signal, dispose } = combineSignals(abortRef.current.signal, 45_000)
    const commitOk = () => shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)
    const store = () => useResultStore.getState()
    store().beginCombined(phrase, tag, 'phrase')

    try {
      const anchor = await resolvePhraseAnchor(phrase, signal, commitOk)
      const webResults = await performWebSearch(phrase, signal)

      const selected: CombinedHalf = cognitiveFromSearchMode(useSearchStore.getState().mode)
      const other: CombinedHalf = selected === 'lookup' ? 'core' : 'lookup'

      let landed = 0
      let lastError: unknown = null
      const captured: { lookup: PhraseResult | null } = { lookup: null }

      const runHalf = async (half: CombinedHalf) => {
        try {
          const r = await aiPhraseQuery(phrase, true, signal, half, { anchor, webResults })
          if (!commitOk()) { store().settleCombinedHalf(half); return }
          landed += 1
          if (half === 'lookup') captured.lookup = r
          store().commitCombinedPhraseHalf(phrase, half, r, tag)
        } catch (e) {
          lastError = e
          store().settleCombinedHalf(half)
        }
      }

      await Promise.all([runHalf(selected), runHalf(other)])
      dispose()

      if (!commitOk()) return

      if (landed === 0 && lastError) {
        const kind = classifyAiRequestError(lastError, signal.reason)
        if (kind === 'abort') return
        if (kind === 'timeout') {
          setAiError(`「${phrase}」请求超时，请重试或检查网络`)
          return
        }
        setAiError(errorMessage(lastError))
        return
      }

      const lr = captured.lookup
      if (lr && (lr.unnaturalMindModel || lr.correctForm)) {
        recordSentenceCorrectionEvent(phrase, lr.correctForm, lr.unnaturalMindModel)
      }
    } catch (e) {
      dispose()
      if (!commitOk()) return
      const kind = classifyAiRequestError(e, signal.reason)
      if (kind === 'abort') return
      if (kind === 'timeout') {
        setAiError(`「${phrase}」请求超时，请重试或检查网络`)
        return
      }
      setAiError(errorMessage(e))
    }
  }, [getCachedCombinedPhrase, setCombinedPhraseResult, setAiError])

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
