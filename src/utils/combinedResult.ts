/**
 * Utilities for the unified Lookup+Core combined AI call architecture.
 *
 * Before v0.9.0, Lookup and Core made separate AI calls with separate caches
 * (word::lookup, word::core). Now a single call returns both halves.
 * The mode tab buttons are view-switchers only — no new AI call on tab flip.
 */

import { normalizeQuery } from './text'
import type { AiFullResult, PhraseResult, CombinedAiResult, CombinedPhraseResult } from '../types'

export type SearchTag = 'normal' | 'bypass'

/**
 * Mode-agnostic cache key for the combined result, tagged by normal vs bypass search.
 */
export function combinedCacheKey(query: string, tag: SearchTag = 'normal'): string {
  const norm = normalizeQuery(query)
  return tag === 'bypass' ? `${norm}::bypass` : `${norm}::combined`
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a raw JSON string from the combined AI call into a CombinedAiResult.
 * Throws a descriptive error if lookup or core keys are missing or JSON is bad.
 */
export function splitCombinedJson(raw: string): CombinedAiResult {
  let parsed: Record<string, unknown>
  try {
    const attempt = JSON.parse(raw)
    // Try to extract the first {...} object if the model wrapped it
    if (typeof attempt === 'object' && attempt !== null) {
      parsed = attempt as Record<string, unknown>
    } else {
      throw new Error('Parsed value is not an object')
    }
  } catch {
    const objMatch = raw.match(/\{[\s\S]*\}/)
    if (!objMatch) throw new Error('AI combined response: could not find a JSON object')
    parsed = JSON.parse(objMatch[0]) as Record<string, unknown>
  }

  if (!parsed.lookup) throw new Error('AI combined response: missing "lookup" key')
  if (!parsed.core) throw new Error('AI combined response: missing "core" key')

  const toFullResult = (v: unknown): AiFullResult => {
    const r = v as AiFullResult
    if (!r.meanings) r.meanings = []
    if (!r.examples) r.examples = []
    return r
  }

  return {
    lookup: toFullResult(parsed.lookup),
    core: toFullResult(parsed.core),
  }
}

/**
 * Parse phrase-type combined response.
 */
export function splitCombinedPhraseJson(raw: string, phrase: string): CombinedPhraseResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    const objMatch = raw.match(/\{[\s\S]*\}/)
    if (!objMatch) throw new Error('AI combined phrase response: could not find a JSON object')
    parsed = JSON.parse(objMatch[0]) as Record<string, unknown>
  }

  if (!parsed.lookup) throw new Error('AI combined phrase response: missing "lookup" key')
  if (!parsed.core) throw new Error('AI combined phrase response: missing "core" key')

  const toPhrase = (v: unknown): PhraseResult => {
    const r = v as PhraseResult
    if (!r.phrase) r.phrase = phrase
    if (!r.examples) r.examples = []
    return r
  }

  return {
    lookup: toPhrase(parsed.lookup),
    core: toPhrase(parsed.core),
  }
}

// ── Legacy reconstruction ────────────────────────────────────────────────────

/**
 * Build a CombinedAiResult from two legacy separate AiFullResult objects.
 * Used so that words cached before v0.9.0 can still be displayed without
 * a new AI call.
 *
 * If `core` is null (e.g. user only ever searched in Lookup mode),
 * the lookup result is mirrored as a placeholder so both views render.
 */
export function reconstructFromLegacy(
  lookup: AiFullResult,
  core: AiFullResult | null
): CombinedAiResult {
  return {
    lookup,
    core: core ?? { ...lookup },
  }
}

/**
 * Build a CombinedPhraseResult from two legacy separate PhraseResult objects.
 */
export function reconstructPhraseFromLegacy(
  lookup: PhraseResult,
  core: PhraseResult | null
): CombinedPhraseResult {
  return {
    lookup,
    core: core ?? { ...lookup },
  }
}

// ── Type guard ───────────────────────────────────────────────────────────────

export function isValidCombinedAiResult(v: unknown): v is CombinedAiResult {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.lookup === 'object' && c.lookup !== null &&
    typeof c.core === 'object' && c.core !== null
  )
}

export function isValidCombinedPhraseResult(v: unknown): v is CombinedPhraseResult {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.lookup === 'object' && c.lookup !== null &&
    typeof c.core === 'object' && c.core !== null
  )
}
