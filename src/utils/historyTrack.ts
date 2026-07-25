import type { CognitiveMode } from '../types'
import type { AiMode, HistoryEntry } from '../stores/historyStore'
import {
  hasCoreCacheEntry,
  hasLookupCacheEntry,
  normalizeQuery,
} from './text'

/**
 * Pick Lookup vs Core for history replay.
 * Returns null when neither track has cache nor intent — caller should stay Instant
 * for dictionary hits (OOD still falls into preferred AI mode separately).
 */
export function resolveHistoryTrack(
  word: string,
  opts: {
    prefer: CognitiveMode
    entry?: HistoryEntry | null
    aiCache: Record<string, unknown>
    aiFullCache: Record<string, unknown>
    phraseCache: Record<string, unknown>
  },
): CognitiveMode | null {
  const { prefer, entry, aiCache, aiFullCache, phraseCache } = opts
  const lookupAvail = hasLookupCacheEntry(word, aiCache, aiFullCache, phraseCache)
    || entry?.lookupAiMode != null
  const coreAvail = hasCoreCacheEntry(word, aiFullCache, phraseCache)
    || entry?.coreAiMode != null
  if (lookupAvail && coreAvail) return prefer
  if (coreAvail) return 'core'
  if (lookupAvail) return 'lookup'
  return null
}

export function historyModeForTrack(
  track: CognitiveMode | null,
  fallbackWhenNull: 'instant' | 'ai' | 'core',
): 'instant' | 'ai' | 'core' {
  if (track === 'core') return 'core'
  if (track === 'lookup') return 'ai'
  return fallbackWhenNull
}

/** Find history entry by normalized word. */
export function findHistoryEntry(
  words: HistoryEntry[],
  word: string,
): HistoryEntry | undefined {
  const nw = normalizeQuery(word)
  return words.find((e) => normalizeQuery(e.word) === nw)
}

export type { AiMode }
