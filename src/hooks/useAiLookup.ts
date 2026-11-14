import { useRef, useCallback } from 'react'
import { useResultStore } from '../stores/resultStore'
import { useSearchStore, detectLanguage } from '../stores/searchStore'
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
import { recordSentenceCorrectionEvent, resolveCurrentLearningRoute } from '../services/profile'
import { resolveDictionaryContext, type ExplanationLanguage } from '../services/dictionaryContext'
import { combineSignals } from '../utils/abortSignal'
import { classifyAiRequestError } from '../utils/aiRequestErrors'
import { createAiRequestGate, shouldCommitAiDisplay } from '../utils/aiRequestGate'
import { cognitiveFromSearchMode, normalizeQuery } from '../utils/text'
import { aiFullNeedsExplanationFill, collocationsNeedFill, conceptGraphNeedsFill } from '../utils/aiCompleteness'
import type { Meaning, CollocationData, ConceptGraph, ConceptGraphExample, LearningRoute, PhraseResult } from '../types'
import type { CombinedHalf } from '../stores/resultStore'
import { combinedCacheKey, type SearchTag } from '../utils/combinedResult'

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
  applySkeleton: (skeleton: MeaningsAnchor) => void,
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

  const language = resolveDictionaryContext(word, useSettingsStore.getState()).explanationLanguage

  if (detectLanguage(word) === 'zh') {
    try {
      const skeleton = await resolveQuerySkeleton(word, 'word', language, signal)
      applySkeleton(skeleton)
      return skeleton
    } catch (e) {
      // A real cancel must stop the whole request; a bad-JSON resolution must not.
      if (classifyAiRequestError(e, signal.reason) === 'abort') throw e
      return undefined
    }
  }

  void previewSkeleton(word, 'word', language, signal, applySkeleton)
  return undefined
}

/** Stage-1 policy for phrases/sentences: preview only, never blocking. */
async function resolvePhraseAnchor(
  phrase: string,
  signal: AbortSignal,
  applySkeleton: (skeleton: MeaningsAnchor) => void,
): Promise<MeaningsAnchor | undefined> {
  const dictionaryContext = resolveDictionaryContext(phrase, useSettingsStore.getState())
  const isSentence = dictionaryContext.queryType === 'sentence'

  // A sentence has exactly one faithful reading and the halves cannot diverge on
  // it, so there is nothing to arbitrate — resolve only to paint the gist early.
  void previewSkeleton(phrase, isSentence ? 'sentence' : 'phrase', dictionaryContext.explanationLanguage, signal, applySkeleton)
  return undefined
}

/**
 * Fire-and-forget early paint. Deliberately swallows every failure: this never
 * gates the real halves, and its signal is shared with them so it dies with them.
 */
function previewSkeleton(
  query: string,
  kind: 'word' | 'phrase' | 'sentence',
  language: ExplanationLanguage,
  signal: AbortSignal,
  applySkeleton: (skeleton: MeaningsAnchor) => void,
): Promise<void> {
  return resolveQuerySkeleton(query, kind, language, signal)
    .then(applySkeleton)
    .catch(() => { /* preview only — the real halves carry the request */ })
}

/* ---------------- Per-query in-flight split requests ---------------- */

/** Whole split request (anchor + web search + both halves). */
const COMBINED_TIMEOUT_MS = 45_000
/**
 * How many different queries may keep running in the background at once. Each
 * one is up to three HTTP requests; beyond this the oldest is cancelled.
 */
const MAX_BACKGROUND_QUERIES = 3

interface InflightRequest {
  id: number
  controller: AbortController
}

/**
 * query+tag -> its running request. Module-scoped: only App starts split
 * requests, and a request must outlive any one render.
 */
const inflight = new Map<string, InflightRequest>()

function inflightKey(kind: 'word' | 'phrase', query: string, tag: SearchTag): string {
  return `${kind}:${combinedCacheKey(query, tag)}`
}

function abortInflight(key: string): void {
  const entry = inflight.get(key)
  if (!entry) return
  inflight.delete(key)
  entry.controller.abort()
  useResultStore.getState().endCombined(entry.id)
}

/** Make room for one more query by cancelling the oldest background ones. */
function enforceInflightLimit(): void {
  while (inflight.size >= MAX_BACKGROUND_QUERIES) {
    const oldest = inflight.keys().next().value
    if (oldest === undefined) return
    abortInflight(oldest)
  }
}

function cancelAllInflight(): void {
  for (const entry of inflight.values()) entry.controller.abort()
  inflight.clear()
  const store = useResultStore.getState()
  store.dropAllCombinedDrafts()
}

/**
 * Attach to a request already running for this query instead of starting a
 * second one (tab flip, revisit from history). Returns true when attached.
 */
function attachInflight(kind: 'word' | 'phrase', query: string, tag: SearchTag): boolean {
  const key = inflightKey(kind, query, tag)
  if (!inflight.has(key)) return false
  if (useResultStore.getState().showCombinedDraft(query, tag, kind)) return true
  // The store forgot the draft (reset / cache clear): the request is orphaned.
  abortInflight(key)
  return false
}

function startInflight(kind: 'word' | 'phrase', query: string, tag: SearchTag): InflightRequest {
  const key = inflightKey(kind, query, tag)
  // Retry / force refresh of the same query: the new request replaces the old one.
  abortInflight(key)
  enforceInflightLimit()
  const controller = new AbortController()
  const id = useResultStore.getState().beginCombined(query, tag, kind)
  const entry = { id, controller }
  inflight.set(key, entry)
  return entry
}

function finishInflight(kind: 'word' | 'phrase', query: string, tag: SearchTag, id: number): void {
  const key = inflightKey(kind, query, tag)
  if (inflight.get(key)?.id === id) inflight.delete(key)
  useResultStore.getState().endCombined(id)
}

/** Readable reason for one failed half. */
function halfFailureText(kind: ReturnType<typeof classifyAiRequestError>, e: unknown): string {
  if (kind === 'timeout') return `请求超时（${COMBINED_TIMEOUT_MS / 1000} 秒内未返回），请重试`
  return errorMessage(e)
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
    cancelAllInflight()
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
  const triggerPhraseQuery = useCallback(async (phrase: string, submittedRoute?: LearningRoute) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const token = gateRef.current.begin()
    const learningRoute = submittedRoute ?? resolveCurrentLearningRoute(phrase)

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
      const result = await aiPhraseQuery(phrase, true, abortRef.current.signal, cognitive, { learningRoute })
      if (!shouldCommitAiDisplay(token, gateRef.current, useSearchStore.getState().mode)) return
      setPhraseResult(phrase, result, cognitive)
      if (result.unnaturalMindModel || result.correctForm) {
        recordSentenceCorrectionEvent(phrase, result.correctForm, result.unnaturalMindModel, learningRoute)
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
  const triggerCombinedLookup = useCallback(async (
    word: string,
    forceRefresh = false,
    tag: SearchTag = 'normal',
    learningRoute?: LearningRoute,
  ) => {
    if (!forceRefresh) {
      // Already running for this word (tab flip / revisit): show it, do not restart.
      if (attachInflight('word', word, tag)) return
      const cached = getCachedCombined(word, tag)
      if (cached) {
        setCombinedResult(word, cached, tag)
        return
      }
    }

    const { id, controller } = startInflight('word', word, tag)
    const { signal, dispose } = combineSignals(controller.signal, COMBINED_TIMEOUT_MS)
    const store = () => useResultStore.getState()
    const applySkeleton = (skeleton: MeaningsAnchor) => store().applyQuerySkeleton(id, skeleton)

    try {
      const anchor = await resolveWordAnchor(word, tag, signal, applySkeleton)

      // One shared web search instead of one per half (it used to run twice).
      const webResults = await performWebSearch(word, signal)

      const selected: CombinedHalf = cognitiveFromSearchMode(useSearchStore.getState().mode)
      const other: CombinedHalf = selected === 'lookup' ? 'core' : 'lookup'

      let landed = 0
      let lastError: unknown = null

      // Every write carries this request's id; the store ignores it once the
      // request is superseded, so a late half can never touch another query.
      const runHalf = async (half: CombinedHalf) => {
        try {
          const r = await aiFullLookup(word, true, signal, half, { anchor, webResults, learningRoute })
          landed += 1
          store().commitCombinedHalf(id, half, r)
        } catch (e) {
          lastError = e
          const kind = classifyAiRequestError(e, signal.reason)
          if (kind === 'abort') return
          store().settleCombinedHalf(id, half, halfFailureText(kind, e))
        }
      }

      // Both fire immediately; the selected half is simply the one on screen, so it
      // is the one the user perceives. Ordering between them is not forced.
      await Promise.all([runHalf(selected), runHalf(other)])

      // Only a total failure is an error — one good half is still a usable result.
      if (landed === 0 && lastError) {
        const kind = classifyAiRequestError(lastError, signal.reason)
        if (kind === 'timeout') {
          store().failCombined(id, `「${word}」较为生僻，AI 未能在时限内解析，建议直接向 AI 提问`)
        } else if (kind !== 'abort') {
          store().failCombined(id, errorMessage(lastError))
        }
      }
    } catch (e) {
      const kind = classifyAiRequestError(e, signal.reason)
      if (kind === 'timeout') {
        store().failCombined(id, `「${word}」较为生僻，AI 未能在时限内解析，建议直接向 AI 提问`)
      } else if (kind !== 'abort') {
        store().failCombined(id, errorMessage(e))
      }
    } finally {
      dispose()
      finishInflight('word', word, tag, id)
    }
  }, [getCachedCombined, setCombinedResult])

  /** v0.9.15: Split combined phrase/sentence call — same two-parallel-halves shape. */
  const triggerCombinedPhraseQuery = useCallback(async (
    phrase: string,
    forceRefresh = false,
    tag: SearchTag = 'normal',
    submittedRoute?: LearningRoute,
  ) => {
    const learningRoute = submittedRoute ?? resolveCurrentLearningRoute(phrase)

    if (!forceRefresh) {
      if (attachInflight('phrase', phrase, tag)) return
      const cached = getCachedCombinedPhrase(phrase, tag)
      if (cached) {
        setCombinedPhraseResult(phrase, cached, tag)
        return
      }
    }

    const { id, controller } = startInflight('phrase', phrase, tag)
    const { signal, dispose } = combineSignals(controller.signal, COMBINED_TIMEOUT_MS)
    const store = () => useResultStore.getState()
    const applySkeleton = (skeleton: MeaningsAnchor) => store().applyQuerySkeleton(id, skeleton)

    try {
      const anchor = await resolvePhraseAnchor(phrase, signal, applySkeleton)
      const webResults = await performWebSearch(phrase, signal)

      const selected: CombinedHalf = cognitiveFromSearchMode(useSearchStore.getState().mode)
      const other: CombinedHalf = selected === 'lookup' ? 'core' : 'lookup'

      let landed = 0
      let lastError: unknown = null
      const captured: { lookup: PhraseResult | null } = { lookup: null }

      const runHalf = async (half: CombinedHalf) => {
        try {
          const r = await aiPhraseQuery(phrase, true, signal, half, { anchor, webResults, learningRoute })
          landed += 1
          if (half === 'lookup') captured.lookup = r
          store().commitCombinedPhraseHalf(id, half, r)
        } catch (e) {
          lastError = e
          const kind = classifyAiRequestError(e, signal.reason)
          if (kind === 'abort') return
          store().settleCombinedHalf(id, half, halfFailureText(kind, e))
        }
      }

      await Promise.all([runHalf(selected), runHalf(other)])

      if (landed === 0 && lastError) {
        const kind = classifyAiRequestError(lastError, signal.reason)
        if (kind === 'timeout') {
          store().failCombined(id, `「${phrase}」请求超时，请重试或检查网络`)
        } else if (kind !== 'abort') {
          store().failCombined(id, errorMessage(lastError))
        }
        return
      }

      // Learner evidence is recorded even when the user has moved on to another
      // query: the sentence was still theirs, only the screen changed.
      const lr = captured.lookup
      if (lr && (lr.unnaturalMindModel || lr.correctForm)) {
        recordSentenceCorrectionEvent(phrase, lr.correctForm, lr.unnaturalMindModel, learningRoute)
      }
    } catch (e) {
      const kind = classifyAiRequestError(e, signal.reason)
      if (kind === 'timeout') {
        store().failCombined(id, `「${phrase}」请求超时，请重试或检查网络`)
      } else if (kind !== 'abort') {
        store().failCombined(id, errorMessage(e))
      }
    } finally {
      dispose()
      finishInflight('phrase', phrase, tag, id)
    }
  }, [getCachedCombinedPhrase, setCombinedPhraseResult])

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
