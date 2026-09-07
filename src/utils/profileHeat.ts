/**
 * Direction G — local "heat" engine for weakness patterns.
 *
 * Each weakness carries `confidence` (0..1, has the learner internalised the fix?)
 * and `lastExposedAt` (when it was last hit). From those we derive a purely local
 * urgency score — no AI, no tokens — used to:
 *   - order / tier the ProfileModal list (hot / warm / cool)
 *   - decide which weaknesses are worth injecting into everyday AI prompts
 *   - gate the result-page insight chip
 *
 *   heat = (1 - confidence) * recencyWeight(lastExposedAt)
 */
import type { UserLanguageProfile, WeaknessPattern } from '../types'

/** Confidence assumed for a weakness with no stored value (freshly added / legacy). */
export const DEFAULT_CONFIDENCE = 0.2

/** Days of "still fresh" before recency starts to decay. */
const PLATEAU_DAYS = 3
/** Exponential time-constant (days) past the plateau. ~0.1 at 21 days, ~0.03 at 30. */
const DECAY_TAU_DAYS = 8

const DAY_MS = 86_400_000

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * 0..1 recency factor. 1.0 while exposed within the last ~3 days, then exponential
 * decay toward 0 over the following weeks. Missing / unparseable timestamp -> 0
 * (treated as ancient). A future timestamp clamps to 1.0.
 */
export function recencyWeight(lastExposedAt: string | undefined | null, now: number = Date.now()): number {
  if (!lastExposedAt) return 0
  const t = Date.parse(lastExposedAt)
  if (Number.isNaN(t)) return 0
  const days = (now - t) / DAY_MS
  if (days <= PLATEAU_DAYS) return 1
  return clamp01(Math.exp(-(days - PLATEAU_DAYS) / DECAY_TAU_DAYS))
}

function confidenceOf(w: WeaknessPattern): number {
  return typeof w.confidence === 'number' && Number.isFinite(w.confidence)
    ? clamp01(w.confidence)
    : DEFAULT_CONFIDENCE
}

/** (1 - confidence) * recencyWeight. 0..1. Tolerates missing fields. */
export function weaknessHeat(w: WeaknessPattern, now: number = Date.now()): number {
  return clamp01((1 - confidenceOf(w)) * recencyWeight(w.lastExposedAt, now))
}

export type WeaknessTier = 'hot' | 'warm' | 'cool'

const HOT_THRESHOLD = 0.55
const WARM_THRESHOLD = 0.25

export function weaknessTier(heat: number): WeaknessTier {
  if (heat >= HOT_THRESHOLD) return 'hot'
  if (heat >= WARM_THRESHOLD) return 'warm'
  return 'cool'
}

/** Active (not mastered) weaknesses, hottest first. Stable for equal heat. */
export function sortActiveByHeat(profile: UserLanguageProfile, now: number = Date.now()): WeaknessPattern[] {
  return (profile.weaknessPatterns ?? [])
    .filter((w) => w.status !== 'mastered')
    .map((w, i) => ({ w, i, h: weaknessHeat(w, now) }))
    .sort((a, b) => b.h - a.h || a.i - b.i)
    .map((x) => x.w)
}

/** Active weaknesses in tier "hot", hottest first, capped at `limit` (default 3). */
export function hotWeaknesses(
  profile: UserLanguageProfile,
  now: number = Date.now(),
  limit = 3,
): WeaknessPattern[] {
  return sortActiveByHeat(profile, now)
    .filter((w) => weaknessTier(weaknessHeat(w, now)) === 'hot')
    .slice(0, Math.max(0, limit))
}
