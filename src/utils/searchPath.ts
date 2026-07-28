/**
 * Dict-hit search routing after Lookup+Core merge (v0.9.0+).
 *
 * Normal search in AI Lookup or Pure Core keeps local L1 first, then fires
 * the combined Lookup→Core pipeline. Force-AI / OOD still bypass the dictionary.
 */

import type { Mode } from '../types'

export type DictHitSearchPlan =
  | { kind: 'instant-only' }
  /** Keep searchSource=local; show dictionary L1; fire combined AI (Lookup then Core). */
  | { kind: 'l1-then-combined' }

/**
 * Plan for a dictionary HIT under a normal (non-force) search.
 * Force-AI never calls this — it always bypasses L1.
 */
export function planDictHitNormalSearch(mode: Mode): DictHitSearchPlan {
  if (mode === 'ai' || mode === 'core') {
    return { kind: 'l1-then-combined' }
  }
  return { kind: 'instant-only' }
}

/**
 * Tab flip Instant → Lookup/Core while a local word is on screen:
 * same pipeline as normal search in those modes (L1 stays, combined fills AI).
 */
export function shouldKeepLocalForAiTab(mode: Mode, searchSource: string, hasWordResult: boolean): boolean {
  return (mode === 'ai' || mode === 'core') && searchSource === 'local' && hasWordResult
}
