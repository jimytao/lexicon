import type { CognitiveMode } from '../types'

/**
 * Normalizes a search query or word for consistent indexing and comparison.
 * Trims whitespace and converts to lowercase.
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Separate Lookup vs Pure Core caches so cognitive prompts do not collide. */
export function cognitiveCacheKey(query: string, cognitive: CognitiveMode = 'lookup'): string {
  const normalized = normalizeQuery(query)
  return cognitive === 'core' ? `${normalized}::core` : normalized
}

/** @deprecated alias — use cognitiveCacheKey */
export const phraseCacheKey = cognitiveCacheKey

export function cognitiveFromSearchMode(mode: string): CognitiveMode {
  return mode === 'core' ? 'core' : 'lookup'
}

/** @deprecated alias — use cognitiveFromSearchMode */
export const phraseCognitiveFromSearchMode = cognitiveFromSearchMode

/** Instant OOD / force-AI：按设置里的默认模式落入 Lookup 或 Core（默认 Instant 时用 Lookup）。 */
export function preferredAiModeFromSettings(defaultSearchMode: string): 'ai' | 'core' {
  return defaultSearchMode === 'core' ? 'core' : 'ai'
}

/** Lookup-track cache present (analyze / full / phrase). */
export function hasLookupCacheEntry(
  query: string,
  aiCache: Record<string, unknown>,
  aiFullCache: Record<string, unknown>,
  phraseCache: Record<string, unknown>,
): boolean {
  const n = normalizeQuery(query)
  return !!(aiCache[n] || aiFullCache[n] || phraseCache[n])
}

/** Pure Core-track cache present (full / phrase ::core). */
export function hasCoreCacheEntry(
  query: string,
  aiFullCache: Record<string, unknown>,
  phraseCache: Record<string, unknown>,
): boolean {
  const n = normalizeQuery(query)
  const core = cognitiveCacheKey(n, 'core')
  return !!(aiFullCache[core] || phraseCache[core])
}

/** True if any Lookup/Core AI cache entry exists for this query. */
export function hasAnyAiCacheEntry(
  query: string,
  aiCache: Record<string, unknown>,
  aiFullCache: Record<string, unknown>,
  phraseCache: Record<string, unknown>,
): boolean {
  return hasLookupCacheEntry(query, aiCache, aiFullCache, phraseCache)
    || hasCoreCacheEntry(query, aiFullCache, phraseCache)
}
