import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WordResult, AiAnalysis, AiFullResult, PhraseResult, SuggestItem, Mnemonic, CognitiveMode, CombinedAiResult, CombinedPhraseResult, Scene } from '../types'
import { normalizeQuery, cognitiveCacheKey } from '../utils/text'
import { combinedCacheKey, reconstructFromLegacy, reconstructPhraseFromLegacy, type SearchTag } from '../utils/combinedResult'
import { aiFullToAnalysis } from '../utils/aiFullToAnalysis'

export type AiStatus = 'idle' | 'loading' | 'success' | 'error'

/** Keep old analyses usable while hiding tips that predate evidence validation. */
function checkedCachedInsight<T extends { profileInsightVersion?: number; profileInsight?: string; profileInsightDirection?: string }>(value: T): T {
  return value.profileInsightVersion === 4 ? value : { ...value, profileInsight: undefined, profileInsightDirection: undefined }
}

/**
 * Stage-1 resolution skeleton. Its job is NOT to enumerate senses for their own
 * sake — it is the disambiguation contract both halves must agree on:
 * which English word are we actually explaining, and (for zh input) which senses.
 */
export interface QuerySkeleton {
  correctForm?: string
  pos?: string
  phonetic?: string
  senses: Array<{ pos?: string; zh: string; en?: string; senseIndex: number }>
}

export type CombinedHalf = 'lookup' | 'core'

/** Which halves of a split combined request are still in flight. */
export interface PendingHalves { lookup: boolean; core: boolean }
export interface FailedHalves { lookup: boolean; core: boolean }

/** Per-half failure reason, shown on the failed half's card instead of a generic line. */
export interface HalfErrors { lookup: string | null; core: string | null }

type DraftKind = 'word' | 'phrase'

/**
 * One in-flight split combined request.
 *
 * Every request gets its own id (the "tag"). A half may only write into the draft
 * whose id it was started with, and a draft only reaches the screen while it is
 * the active one. A query the user navigated away from keeps filling its own
 * draft and cache in the background, so revisiting it needs no new request.
 */
interface CombinedDraft {
  id: number
  key: string
  tag: SearchTag
  kind: DraftKind
  query: string
  lookup: AiFullResult | PhraseResult | null
  core: AiFullResult | PhraseResult | null
  skeleton: QuerySkeleton | null
  pending: PendingHalves
  failed: FailedHalves
  errors: HalfErrors
}

const NO_PENDING: PendingHalves = { lookup: false, core: false }
const NO_HALF_ERRORS: HalfErrors = { lookup: null, core: null }

function emptyFull(skeleton: QuerySkeleton | null, fallbackWord: string): AiFullResult {
  return {
    correctForm: skeleton?.correctForm || fallbackWord,
    phonetic: skeleton?.phonetic || '',
    pos: skeleton?.pos || '',
    meanings: (skeleton?.senses ?? []).map(sn => ({
      senseIndex: sn.senseIndex,
      zh: sn.zh,
      en: sn.en ?? '',
      pos: sn.pos,
    })),
    examples: [],
  }
}

function emptyPhrase(skeleton: QuerySkeleton | null, fallbackPhrase: string): PhraseResult {
  const first = skeleton?.senses?.[0]
  return {
    phrase: fallbackPhrase,
    correctForm: skeleton?.correctForm || fallbackPhrase,
    meaning: first ? (first.zh || first.en || '') : '',
    examples: [],
  }
}

interface ResultStore {
  wordResult: WordResult | null
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiFullResult: AiFullResult | null
  phraseResult: PhraseResult | null
  /** v0.9.0: active combined result (both lookup + core populated from one AI call) */
  combinedResult: CombinedAiResult | null
  /** v0.9.0: active combined phrase result */
  combinedPhraseResult: CombinedPhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  /** Split-call progress: which halves are still in flight (v0.9.15). */
  aiPendingHalves: PendingHalves
  /** Split-call failures are tracked per half so one successful tab cannot mask the other. */
  aiFailedHalves: FailedHalves
  /** True while the displayed result is only the stage-1 skeleton preview. */
  aiIsPartial: boolean
  /** Stage-1 skeleton for the active query (display only, never cached). */
  aiSkeleton: QuerySkeleton | null
  /** Real failure reason per half of the active split request. */
  aiHalfErrors: HalfErrors
  aiCache: Record<string, AiAnalysis>
  aiFullCache: Record<string, AiFullResult>
  phraseCache: Record<string, PhraseResult>
  /** v0.9.0: single combined cache (replaces separate lookup/core caches for new searches) */
  combinedCache: Record<string, CombinedAiResult>
  combinedPhraseCache: Record<string, CombinedPhraseResult>

  setWordResult: (r: WordResult | null, clearAi?: boolean) => void
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  /**
   * Start a split combined request and put it on screen. Returns the request id
   * every later write for this request must carry. Supersedes (drops) any earlier
   * draft for the same query + tag.
   */
  beginCombined: (query: string, tag: SearchTag, kind: DraftKind) => number
  /** True while a request for this query + tag is still filling its draft. */
  hasCombinedDraft: (query: string, tag?: SearchTag) => boolean
  /** Put an in-flight request back on screen (revisit). False when there is none. */
  showCombinedDraft: (query: string, tag: SearchTag, kind: DraftKind) => boolean
  /** Apply the stage-1 skeleton as an early preview. Never writes to any cache. */
  applyQuerySkeleton: (requestId: number, skeleton: QuerySkeleton) => void
  /** Commit one half of a split word request; caches only once both halves land. */
  commitCombinedHalf: (requestId: number, half: CombinedHalf, r: AiFullResult) => void
  /** Commit one half of a split phrase request. */
  commitCombinedPhraseHalf: (requestId: number, half: CombinedHalf, r: PhraseResult) => void
  /** Mark a half as failed so its spinner stops; `error` is shown on that half's card. */
  settleCombinedHalf: (requestId: number, half: CombinedHalf, error?: string) => void
  /** Both halves failed: the request ends in a single error state. */
  failCombined: (requestId: number, error: string) => void
  /** The request is over (landed, failed or cancelled): forget its draft. */
  endCombined: (requestId: number) => void
  /** Stop showing any in-flight request; background drafts keep filling their caches. */
  detachCombinedDisplay: () => void
  /** Forget every in-flight draft (cancel-all, e.g. language change). */
  dropAllCombinedDrafts: () => void
  setAiFullResult: (word: string, r: AiFullResult, cognitive?: CognitiveMode) => void
  setPhraseResult: (key: string, r: PhraseResult, cognitive?: CognitiveMode) => void
  /** v0.9.0: store combined result and update active display */
  setCombinedResult: (word: string, r: CombinedAiResult, tag?: SearchTag) => void
  setCombinedPhraseResult: (phrase: string, r: CombinedPhraseResult, tag?: SearchTag) => void
  setAiError: (e: string) => void
  updateMnemonic: (word: string, m: Mnemonic) => void
  updateMeaningExtension: (word: string, index: number, ext: { scene?: Scene; imageQuery?: string }) => void
  updateFullMnemonic: (word: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  updatePhraseMnemonic: (key: string, m: Mnemonic, cognitive?: CognitiveMode) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string, cognitive?: CognitiveMode) => AiFullResult | null
  getCachedPhrase: (key: string, cognitive?: CognitiveMode) => PhraseResult | null
  /** v0.9.0: get combined result from cache (with legacy fallback reconstruction) */
  getCachedCombined: (word: string, tag?: SearchTag) => CombinedAiResult | null
  getCachedCombinedPhrase: (phrase: string, tag?: SearchTag) => CombinedPhraseResult | null
  clearCache: () => void
  clearCacheOnly: () => void
  evictCacheEntry: (key: string) => void
  reset: () => void
}

const CACHE_LIMIT = 100

/**
 * Display fields for a draft that is (back) on screen. `revisit` repaints every
 * field, because what is on screen right now belongs to another query.
 */
function paintDraft(d: CombinedDraft, revisit = false): Partial<ResultStore> {
  const landed = Boolean(d.lookup || d.core)
  const anyPending = d.pending.lookup || d.pending.core
  const status: Partial<ResultStore> = {
    aiStatus: landed || d.skeleton ? 'success' : 'loading',
    aiError: null,
    aiSkeleton: d.skeleton,
    aiIsPartial: landed ? !(d.lookup && d.core) : Boolean(d.skeleton) && anyPending,
    aiPendingHalves: d.pending,
    aiFailedHalves: d.failed,
    aiHalfErrors: d.errors,
  }
  if (!landed && !d.skeleton) return status

  // Until the lookup half lands, the lookup view keeps the skeleton preview -
  // never an empty shell built after core arrived first.
  const showLookup = revisit || Boolean(d.lookup) || !landed
  if (d.kind === 'word') {
    const lookup = (d.lookup as AiFullResult | null) ?? emptyFull(d.skeleton, d.query)
    const core = (d.core as AiFullResult | null) ?? emptyFull(d.skeleton, d.query)
    return {
      ...status,
      combinedResult: { lookup, core },
      ...(showLookup ? { aiFullResult: lookup, aiAnalysis: aiFullToAnalysis(lookup) } : {}),
    }
  }
  const lookup = (d.lookup as PhraseResult | null) ?? emptyPhrase(d.skeleton, d.query)
  const core = (d.core as PhraseResult | null) ?? emptyPhrase(d.skeleton, d.query)
  return {
    ...status,
    combinedPhraseResult: { lookup, core },
    ...(showLookup ? { phraseResult: lookup } : {}),
  }
}

/**
 * In-flight split requests. Module-scoped rather than store state: they change on
 * every half and must not trigger a re-render of their own.
 *
 *   drafts       request id -> draft
 *   latestByKey  query+tag  -> id of the newest request for it (retry supersedes)
 *   activeId     the request currently on screen, or null
 */
const drafts = new Map<number, CombinedDraft>()
const latestByKey = new Map<string, number>()
let activeId: number | null = null
let nextRequestId = 1

function liveDraft(id: number): CombinedDraft | null {
  const d = drafts.get(id)
  if (!d || latestByKey.get(d.key) !== id) return null
  return d
}

function forgetDraft(id: number): void {
  const d = drafts.get(id)
  if (!d) return
  drafts.delete(id)
  if (latestByKey.get(d.key) === id) latestByKey.delete(d.key)
  if (activeId === id) activeId = null
}

function forgetAllDrafts(): void {
  drafts.clear()
  latestByKey.clear()
  activeId = null
}

export const useResultStore = create<ResultStore>()(
  persist(
    (set, get) => ({
      wordResult: null,
      relatedPhrases: [],
      aiAnalysis: null,
      aiFullResult: null,
      phraseResult: null,
      combinedResult: null,
      combinedPhraseResult: null,
      aiStatus: 'idle',
      aiError: null,
      aiPendingHalves: NO_PENDING,
      aiFailedHalves: NO_PENDING,
      aiIsPartial: false,
      aiSkeleton: null,
      aiHalfErrors: NO_HALF_ERRORS,
      aiCache: {},
      aiFullCache: {},
      phraseCache: {},
      combinedCache: {},
      combinedPhraseCache: {},

      setWordResult: (wordResult, clearAi = true) => {
        if (clearAi) {
          // A new query takes the screen; earlier requests keep filling in the background.
          activeId = null
          set({ 
            wordResult, 
            relatedPhrases: [], 
            aiAnalysis: null, 
            aiFullResult: null, 
            phraseResult: null, 
            aiStatus: 'idle', 
            aiError: null,
            aiPendingHalves: NO_PENDING,
            aiFailedHalves: NO_PENDING,
            aiIsPartial: false,
            aiSkeleton: null,
            aiHalfErrors: NO_HALF_ERRORS,
          })
        } else {
          set({ wordResult })
        }
      },
      setRelatedPhrases: (relatedPhrases) => set({ relatedPhrases }),
      setAiStatus: (aiStatus) => set({ aiStatus }),
      setAiAnalysis: (word, aiAnalysis) => {
        const normalized = normalizeQuery(word)
        const cache = { ...get().aiCache }
        delete cache[normalized] // Move to end
        cache[normalized] = aiAnalysis
        
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiCache: cache, aiAnalysis, aiStatus: 'success' })
      },
      beginCombined: (query, tag, kind) => {
        const key = combinedCacheKey(query, tag)
        const previous = latestByKey.get(key)
        if (previous !== undefined) forgetDraft(previous)

        const id = nextRequestId++
        drafts.set(id, {
          id, key, tag, kind, query,
          lookup: null,
          core: null,
          skeleton: null,
          pending: { lookup: true, core: true },
          failed: NO_PENDING,
          errors: NO_HALF_ERRORS,
        })
        latestByKey.set(key, id)
        activeId = id
        set({
          aiStatus: 'loading',
          aiError: null,
          aiSkeleton: null,
          aiIsPartial: false,
          aiPendingHalves: { lookup: true, core: true },
          aiFailedHalves: NO_PENDING,
          aiHalfErrors: NO_HALF_ERRORS,
        })
        return id
      },

      hasCombinedDraft: (query, tag = 'normal') => latestByKey.has(combinedCacheKey(query, tag)),

      showCombinedDraft: (query, tag, kind) => {
        const id = latestByKey.get(combinedCacheKey(query, tag))
        const d = id === undefined ? null : liveDraft(id)
        if (!d || d.kind !== kind) return false
        activeId = d.id
        set(paintDraft(d, true))
        return true
      },

      applyQuerySkeleton: (requestId, skeleton) => {
        const d = liveDraft(requestId)
        if (!d) return
        // Never downgrade: if a real half already landed, the skeleton is obsolete.
        if (d.lookup || d.core) return
        d.skeleton = skeleton
        if (activeId === d.id) set(paintDraft(d))
      },

      commitCombinedHalf: (requestId, half, result) => {
        const d = liveDraft(requestId)
        if (!d || d.kind !== 'word') return
        d[half] = result
        d.pending = { ...d.pending, [half]: false }
        d.failed = { ...d.failed, [half]: false }
        d.errors = { ...d.errors, [half]: null }

        // A single half is still worth persisting on its own: getCachedCombined's
        // legacy path can reconstruct from aiFullCache if the other half never lands.
        const fullCache = { ...get().aiFullCache }
        const halfKey = cognitiveCacheKey(d.query, half)
        delete fullCache[halfKey]
        fullCache[halfKey] = result
        const fullKeys = Object.keys(fullCache)
        if (fullKeys.length > CACHE_LIMIT) delete fullCache[fullKeys[0]]

        const combinedCache = { ...get().combinedCache }
        if (d.lookup && d.core) {
          delete combinedCache[d.key]
          combinedCache[d.key] = { lookup: d.lookup as AiFullResult, core: d.core as AiFullResult }
          const keys = Object.keys(combinedCache)
          if (keys.length > CACHE_LIMIT) delete combinedCache[keys[0]]
        }

        set({
          aiFullCache: fullCache,
          combinedCache,
          ...(activeId === d.id ? paintDraft(d) : {}),
        })
      },

      commitCombinedPhraseHalf: (requestId, half, result) => {
        const d = liveDraft(requestId)
        if (!d || d.kind !== 'phrase') return
        d[half] = result
        d.pending = { ...d.pending, [half]: false }
        d.failed = { ...d.failed, [half]: false }
        d.errors = { ...d.errors, [half]: null }

        const pCache = { ...get().phraseCache }
        const halfKey = cognitiveCacheKey(d.query, half)
        delete pCache[halfKey]
        pCache[halfKey] = result
        const pKeys = Object.keys(pCache)
        if (pKeys.length > CACHE_LIMIT) delete pCache[pKeys[0]]

        const combinedPhraseCache = { ...get().combinedPhraseCache }
        if (d.lookup && d.core) {
          delete combinedPhraseCache[d.key]
          combinedPhraseCache[d.key] = { lookup: d.lookup as PhraseResult, core: d.core as PhraseResult }
          const keys = Object.keys(combinedPhraseCache)
          if (keys.length > CACHE_LIMIT) delete combinedPhraseCache[keys[0]]
        }

        set({
          phraseCache: pCache,
          combinedPhraseCache,
          ...(activeId === d.id ? paintDraft(d) : {}),
        })
      },

      settleCombinedHalf: (requestId, half, error) => {
        // The fix for "a superseded request marks the current one as failed":
        // a half can only fail the request it was started with.
        const d = liveDraft(requestId)
        if (!d) return
        d.pending = { ...d.pending, [half]: false }
        d.failed = { ...d.failed, [half]: true }
        d.errors = { ...d.errors, [half]: error ?? null }
        if (activeId === d.id) set(paintDraft(d))
      },

      failCombined: (requestId, error) => {
        const d = liveDraft(requestId)
        if (!d) return
        const onScreen = activeId === d.id
        forgetDraft(requestId)
        if (onScreen) {
          set({
            aiError: error,
            aiStatus: 'error',
            aiPendingHalves: NO_PENDING,
            aiFailedHalves: { lookup: true, core: true },
            aiHalfErrors: NO_HALF_ERRORS,
            aiIsPartial: false,
          })
        }
      },

      endCombined: (requestId) => {
        // The screen stays as it is; a revisit now goes through the cache.
        forgetDraft(requestId)
      },

      detachCombinedDisplay: () => { activeId = null },

      dropAllCombinedDrafts: () => { forgetAllDrafts() },

      updateMnemonic: (word, mnemonic) => {
        const normalized = normalizeQuery(word)
        const current = get().aiAnalysis
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiCache }
          delete cache[normalized]
          cache[normalized] = updated

          // Also sync combinedCache lookup half so history re-opens pick up the mnemonic.
          // (ResultView uses aiAnalysis, but history loads restore via combinedCache.)
          const combinedCache = { ...get().combinedCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(word, tag)
            if (combinedCache[ck]) {
              combinedCache[ck] = {
                ...combinedCache[ck],
                lookup: { ...combinedCache[ck].lookup, mnemonic },
              }
            }
          }

          set({ aiCache: cache, aiAnalysis: updated, combinedCache })
        }
      },

      updateMeaningExtension: (word, index, ext) => {
        const normalized = normalizeQuery(word)
        const current = get().aiAnalysis
        const combined = get().combinedResult
        const combinedKey = combinedCacheKey(word, 'normal')

        let updatedAi = current
        if (current) {
          const meanings = [...(current.meanings ?? [])]
          if (meanings[index]) {
            meanings[index] = {
              ...meanings[index],
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
            updatedAi = { ...current, meanings }
          }
          // If index is out of range (dict has more senses than AI meanings array),
          // do NOT write to aiAnalysis — it would create a sparse JS array with
          // undefined holes, causing "Cannot read properties of undefined" crashes
          // in MeaningList when iterating the meanings.
          // The scene is still persisted via combinedResult / localScenes below.
        }

        let updatedCombined = combined
        const combinedCache = { ...get().combinedCache }
        if (combined) {
          const lookupMeanings = [...(combined.lookup.meanings ?? [])]
          if (lookupMeanings[index]) {
            lookupMeanings[index] = {
              ...lookupMeanings[index],
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          } else if (index < lookupMeanings.length) {
            // Only fill if index is within array bounds — never create sparse arrays.
            lookupMeanings[index] = {
              zh: '',
              en: '',
              ...(ext.scene ? { scene: ext.scene } : {}),
              ...(ext.imageQuery ? { imageQuery: ext.imageQuery } : {}),
            }
          }
          const updatedLookup = { ...combined.lookup, meanings: lookupMeanings }
          updatedCombined = { ...combined, lookup: updatedLookup }
          if (combinedCache[combinedKey]) {
            combinedCache[combinedKey] = updatedCombined
          }
        }

        const cache = { ...get().aiCache }
        if (updatedAi) {
          delete cache[normalized]
          cache[normalized] = updatedAi
        }

        set({
          aiCache: cache,
          aiAnalysis: updatedAi,
          combinedResult: updatedCombined,
          combinedCache,
        })
      },
      updateFullMnemonic: (word, mnemonic, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const current = get().aiFullResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().aiFullCache }
          delete cache[cacheKey]
          cache[cacheKey] = updated

          // Also sync combinedCache so history re-opens pick up the mnemonic.
          // The mnemonic lives in the 'lookup' or 'core' half matching `cognitive`.
          const half = cognitive === 'core' ? 'core' : 'lookup'
          const combinedCache = { ...get().combinedCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(word, tag)
            if (combinedCache[ck]) {
              combinedCache[ck] = {
                ...combinedCache[ck],
                [half]: { ...combinedCache[ck][half], mnemonic },
              }
            }
          }

          set({ aiFullCache: cache, aiFullResult: updated, combinedCache })
        }
      },
      updatePhraseMnemonic: (key, mnemonic, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const current = get().phraseResult
        if (current) {
          const updated = { ...current, mnemonic }
          const cache = { ...get().phraseCache }
          delete cache[cacheKey]
          cache[cacheKey] = updated

          // Also sync combinedPhraseCache so history re-opens pick up the mnemonic.
          const half = cognitive === 'core' ? 'core' : 'lookup'
          const combinedPhraseCache = { ...get().combinedPhraseCache }
          for (const tag of ['normal', 'bypass'] as const) {
            const ck = combinedCacheKey(key, tag)
            if (combinedPhraseCache[ck]) {
              combinedPhraseCache[ck] = {
                ...combinedPhraseCache[ck],
                [half]: { ...combinedPhraseCache[ck][half], mnemonic },
              }
            }
          }

          set({ phraseCache: cache, phraseResult: updated, combinedPhraseCache })
        }
      },

      setAiFullResult: (word, aiFullResult, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const cache = { ...get().aiFullCache }
        delete cache[cacheKey]
        cache[cacheKey] = aiFullResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ aiFullCache: cache, aiFullResult, aiStatus: 'success' })
      },
      setPhraseResult: (key, phraseResult, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const cache = { ...get().phraseCache }
        delete cache[cacheKey]
        cache[cacheKey] = phraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) {
          delete cache[keys[0]]
        }
        set({ phraseCache: cache, phraseResult, aiStatus: 'success' })
      },
      setAiError: (aiError) => set({
        aiError,
        aiStatus: 'error',
        aiPendingHalves: NO_PENDING,
        aiFailedHalves: { lookup: true, core: true },
        aiHalfErrors: NO_HALF_ERRORS,
        aiIsPartial: false,
      }),

      // v0.9.0: combined cache tagged by normal vs bypass
      setCombinedResult: (word, combinedResult, tag = 'normal') => {
        const key = combinedCacheKey(word, tag)
        const cache = { ...get().combinedCache }
        delete cache[key]
        cache[key] = combinedResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        // A finished result now owns the screen; in-flight requests stay in the background.
        activeId = null
        set({
          combinedCache: cache,
          combinedResult,
          aiFullResult: combinedResult.lookup,
          aiAnalysis: aiFullToAnalysis(combinedResult.lookup),
          aiStatus: 'success',
          aiPendingHalves: NO_PENDING,
          aiFailedHalves: NO_PENDING,
          aiIsPartial: false,
          aiSkeleton: null,
          aiHalfErrors: NO_HALF_ERRORS,
        })
      },
      setCombinedPhraseResult: (phrase, combinedPhraseResult, tag = 'normal') => {
        const key = combinedCacheKey(phrase, tag)
        const cache = { ...get().combinedPhraseCache }
        delete cache[key]
        cache[key] = combinedPhraseResult
        const keys = Object.keys(cache)
        if (keys.length > CACHE_LIMIT) delete cache[keys[0]]
        activeId = null
        set({
          combinedPhraseCache: cache,
          combinedPhraseResult,
          phraseResult: combinedPhraseResult.lookup,
          aiStatus: 'success',
          aiPendingHalves: NO_PENDING,
          aiFailedHalves: NO_PENDING,
          aiIsPartial: false,
          aiSkeleton: null,
          aiHalfErrors: NO_HALF_ERRORS,
        })
      },
      getCachedCombined: (word, tag = 'normal') => {
        const key = combinedCacheKey(word, tag)
        const cache = get().combinedCache
        if (cache[key]) {
          const updated = { ...cache }
          const original = updated[key]
          const val = { ...original, lookup: checkedCachedInsight(original.lookup), core: checkedCachedInsight(original.core) }
          delete updated[key]
          updated[key] = val
          set({ combinedCache: updated })
          return val
        }
        // Legacy fallback (normal tag only): reconstruct from old separate caches if available.
        // Skipped while a request for this query is still running: its lone first
        // half is in aiFullCache too, and must not be passed off as a finished result.
        if (tag === 'normal' && !latestByKey.has(key)) {
          const n = normalizeQuery(word)
          const legacyLookup = get().aiFullCache[n] ? checkedCachedInsight(get().aiFullCache[n]) : null
          const legacyCore = get().aiFullCache[cognitiveCacheKey(n, 'core')] ? checkedCachedInsight(get().aiFullCache[cognitiveCacheKey(n, 'core')]) : null
          if (legacyLookup || legacyCore) {
            return reconstructFromLegacy(
              legacyLookup ?? legacyCore!,
              legacyCore
            )
          }
        }
        return null
      },
      getCachedCombinedPhrase: (phrase, tag = 'normal') => {
        const key = combinedCacheKey(phrase, tag)
        const cache = get().combinedPhraseCache
        if (cache[key]) {
          const updated = { ...cache }
          const original = updated[key]
          const val = { ...original, lookup: checkedCachedInsight(original.lookup), core: checkedCachedInsight(original.core) }
          delete updated[key]
          updated[key] = val
          set({ combinedPhraseCache: updated })
          return val
        }
        if (tag === 'normal' && !latestByKey.has(key)) {
          const n = normalizeQuery(phrase)
          const legacyLookup = get().phraseCache[n] ? checkedCachedInsight(get().phraseCache[n]) : null
          const legacyCore = get().phraseCache[cognitiveCacheKey(n, 'core')] ? checkedCachedInsight(get().phraseCache[cognitiveCacheKey(n, 'core')]) : null
          if (legacyLookup || legacyCore) {
            return reconstructPhraseFromLegacy(
              legacyLookup ?? legacyCore!,
              legacyCore
            )
          }
        }
        return null
      },
      getCachedAi: (word) => {
        const normalized = normalizeQuery(word)
        const cache = get().aiCache
        if (cache[normalized]) {
          // Touch: move to end
          const updated = { ...cache }
          let val = updated[normalized]
          delete updated[normalized]
          // Sanitize: filter out any empty slots / undefined holes left by legacy sparse-array bug
          // Note: Array.from turns empty slots into undefined so filter(Boolean) can drop them.
          if (Array.isArray(val.meanings)) {
            const cleaned = Array.from(val.meanings).filter(Boolean)
            if (cleaned.length !== val.meanings.length) {
              val = { ...val, meanings: cleaned }
            }
          }
          updated[normalized] = val
          set({ aiCache: updated })
          return val
        }
        return null
      },
      getCachedAiFull: (word, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(word, cognitive)
        const cache = get().aiFullCache
        if (cache[cacheKey]) {
          const updated = { ...cache }
          const val = checkedCachedInsight(updated[cacheKey])
          delete updated[cacheKey]
          updated[cacheKey] = val
          set({ aiFullCache: updated })
          return val
        }
        return null
      },
      getCachedPhrase: (key, cognitive = 'lookup') => {
        const cacheKey = cognitiveCacheKey(key, cognitive)
        const cache = get().phraseCache
        if (cache[cacheKey]) {
          const updated = { ...cache }
          const val = checkedCachedInsight(updated[cacheKey])
          delete updated[cacheKey]
          updated[cacheKey] = val
          set({ phraseCache: updated })
          return val
        }
        return null
      },
      clearCache: () => { forgetAllDrafts(); return set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, combinedCache: {}, combinedPhraseCache: {}, aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null, aiPendingHalves: NO_PENDING, aiFailedHalves: NO_PENDING, aiIsPartial: false, aiSkeleton: null, aiHalfErrors: NO_HALF_ERRORS }) },
      clearCacheOnly: () => set({ aiCache: {}, aiFullCache: {}, phraseCache: {}, combinedCache: {}, combinedPhraseCache: {} }),
      evictCacheEntry: (key) => {
        const normalized = normalizeQuery(key)
        set((state) => {
          const aiCache = { ...state.aiCache }
          const aiFullCache = { ...state.aiFullCache }
          const phraseCache = { ...state.phraseCache }
          delete aiCache[normalized]
          delete aiFullCache[normalized]
          delete aiFullCache[cognitiveCacheKey(normalized, 'core')]
          delete phraseCache[normalized]
          delete phraseCache[cognitiveCacheKey(normalized, 'core')]
          const combinedCache = { ...state.combinedCache }
          const combinedPhraseCache = { ...state.combinedPhraseCache }
          delete combinedCache[combinedCacheKey(normalized)]
          delete combinedPhraseCache[combinedCacheKey(normalized)]
          return { aiCache, aiFullCache, phraseCache, combinedCache, combinedPhraseCache }
        })
      },
      reset: () => { forgetAllDrafts(); return set({ wordResult: null, relatedPhrases: [], aiAnalysis: null, aiFullResult: null, phraseResult: null, combinedResult: null, combinedPhraseResult: null, aiStatus: 'idle', aiError: null, aiPendingHalves: NO_PENDING, aiFailedHalves: NO_PENDING, aiIsPartial: false, aiSkeleton: null, aiHalfErrors: NO_HALF_ERRORS }) },
    }),
    { 
      name: 'lexicon-results',
      partialize: (state) => ({
        aiCache: state.aiCache,
        aiFullCache: state.aiFullCache,
        phraseCache: state.phraseCache,
        combinedCache: state.combinedCache,
        combinedPhraseCache: state.combinedPhraseCache,
      })
    }
  )
)
