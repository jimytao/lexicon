/**
 * TDD: profileHeat — local "heat" engine for weakness patterns (Direction G).
 * Contracts written before implementation.
 *
 * heat = (1 - confidence) * recencyWeight(lastExposedAt)
 *  - fresh + low confidence  -> hot   ("work on this now")
 *  - old   + low confidence  -> warm  ("still shaky, cooling")
 *  - recent+ high confidence -> cool  ("you're getting it")
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIDENCE,
  recencyWeight,
  weaknessHeat,
  weaknessTier,
  sortActiveByHeat,
  hotWeaknesses,
} from './profileHeat'
import type { UserLanguageProfile, WeaknessPattern } from '../types'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-07T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

function weakness(over: Partial<WeaknessPattern> = {}): WeaknessPattern {
  return {
    id: over.id ?? 'w',
    description: over.description ?? 'desc',
    sourceTrigger: over.sourceTrigger ?? 'src',
    track: over.track ?? 'vocabulary',
    status: over.status ?? 'learning',
    occurrenceCount: over.occurrenceCount ?? 1,
    confidence: over.confidence,
    lastExposedAt: over.lastExposedAt,
    contrastExample: over.contrastExample,
  }
}

function profile(weaknessPatterns: WeaknessPattern[]): UserLanguageProfile {
  return {
    lastUpdated: daysAgo(1),
    totalDiagnosticsRun: 1,
    weaknessPatterns,
    recentExplorationFocus: [],
    recommendations: [],
  }
}

describe('recencyWeight', () => {
  it('is 1.0 for something exposed today', () => {
    expect(recencyWeight(daysAgo(0), NOW)).toBeCloseTo(1, 5)
  })

  it('stays 1.0 within the ~3 day plateau', () => {
    expect(recencyWeight(daysAgo(3), NOW)).toBeCloseTo(1, 5)
  })

  it('decays below 1 after the plateau and keeps decreasing', () => {
    const w10 = recencyWeight(daysAgo(10), NOW)
    const w21 = recencyWeight(daysAgo(21), NOW)
    const w30 = recencyWeight(daysAgo(30), NOW)
    expect(w10).toBeLessThan(1)
    expect(w10).toBeGreaterThan(w21)
    expect(w21).toBeGreaterThan(w30)
    expect(w30).toBeLessThan(0.1)
  })

  it('is always within [0, 1]', () => {
    for (const d of [0, 1, 5, 12, 25, 90, 400]) {
      const v = recencyWeight(daysAgo(d), NOW)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('clamps a future timestamp to 1.0', () => {
    expect(recencyWeight(daysAgo(-5), NOW)).toBe(1)
  })

  it('returns 0 for a missing / unparseable timestamp', () => {
    expect(recencyWeight(undefined, NOW)).toBe(0)
    expect(recencyWeight('not-a-date', NOW)).toBe(0)
  })

  it('defaults now to Date.now() when omitted', () => {
    expect(recencyWeight(new Date().toISOString())).toBeCloseTo(1, 3)
  })
})

describe('weaknessHeat', () => {
  it('is ~0 when the learner has fully internalised the fix (confidence 1)', () => {
    expect(weaknessHeat(weakness({ confidence: 1, lastExposedAt: daysAgo(0) }), NOW)).toBeCloseTo(0, 5)
  })

  it('is ~1 for a fresh, not-yet-fixed pattern (confidence 0, exposed today)', () => {
    expect(weaknessHeat(weakness({ confidence: 0, lastExposedAt: daysAgo(0) }), NOW)).toBeCloseTo(1, 5)
  })

  it('drops as the pattern goes stale even at low confidence', () => {
    const fresh = weaknessHeat(weakness({ confidence: 0, lastExposedAt: daysAgo(0) }), NOW)
    const stale = weaknessHeat(weakness({ confidence: 0, lastExposedAt: daysAgo(25) }), NOW)
    expect(stale).toBeLessThan(fresh)
  })

  it('uses DEFAULT_CONFIDENCE when confidence is missing', () => {
    const explicit = weaknessHeat(weakness({ confidence: DEFAULT_CONFIDENCE, lastExposedAt: daysAgo(0) }), NOW)
    const missing = weaknessHeat(weakness({ lastExposedAt: daysAgo(0) }), NOW)
    expect(missing).toBeCloseTo(explicit, 6)
  })

  it('tolerates a missing lastExposedAt (treated as ancient -> 0)', () => {
    expect(weaknessHeat(weakness({ confidence: 0 }), NOW)).toBe(0)
  })

  it('clamps an out-of-range confidence', () => {
    expect(weaknessHeat(weakness({ confidence: 5, lastExposedAt: daysAgo(0) }), NOW)).toBe(0)
    expect(weaknessHeat(weakness({ confidence: -3, lastExposedAt: daysAgo(0) }), NOW)).toBeCloseTo(1, 5)
  })
})

describe('weaknessTier', () => {
  it('maps heat onto hot / warm / cool by threshold', () => {
    expect(weaknessTier(0.9)).toBe('hot')
    expect(weaknessTier(0.55)).toBe('hot')
    expect(weaknessTier(0.54)).toBe('warm')
    expect(weaknessTier(0.25)).toBe('warm')
    expect(weaknessTier(0.24)).toBe('cool')
    expect(weaknessTier(0)).toBe('cool')
  })

  it('a fresh default-confidence weakness lands in "hot"', () => {
    const h = weaknessHeat(weakness({ lastExposedAt: daysAgo(0) }), NOW)
    expect(weaknessTier(h)).toBe('hot')
  })
})

describe('sortActiveByHeat', () => {
  it('excludes mastered patterns', () => {
    const p = profile([
      weakness({ id: 'a', status: 'learning', lastExposedAt: daysAgo(0) }),
      weakness({ id: 'b', status: 'mastered', lastExposedAt: daysAgo(0) }),
    ])
    expect(sortActiveByHeat(p, NOW).map((w) => w.id)).toEqual(['a'])
  })

  it('orders active patterns by heat, hottest first', () => {
    const p = profile([
      weakness({ id: 'cold', confidence: 0.9, lastExposedAt: daysAgo(20) }),
      weakness({ id: 'hot', confidence: 0.1, lastExposedAt: daysAgo(0) }),
      weakness({ id: 'mid', confidence: 0.4, lastExposedAt: daysAgo(8) }),
    ])
    expect(sortActiveByHeat(p, NOW).map((w) => w.id)).toEqual(['hot', 'mid', 'cold'])
  })

  it('is stable for equal heat', () => {
    const p = profile([
      weakness({ id: 'x', confidence: 0.3, lastExposedAt: daysAgo(0) }),
      weakness({ id: 'y', confidence: 0.3, lastExposedAt: daysAgo(0) }),
    ])
    expect(sortActiveByHeat(p, NOW).map((w) => w.id)).toEqual(['x', 'y'])
  })
})

describe('hotWeaknesses', () => {
  it('returns only tier==="hot" active patterns, hottest first', () => {
    const p = profile([
      weakness({ id: 'h1', confidence: 0.1, lastExposedAt: daysAgo(0) }),
      weakness({ id: 'warm', confidence: 0.5, lastExposedAt: daysAgo(9) }),
      weakness({ id: 'h2', confidence: 0.2, lastExposedAt: daysAgo(1) }),
      weakness({ id: 'cool', confidence: 0.2, lastExposedAt: daysAgo(40) }),
    ])
    expect(hotWeaknesses(p, NOW).map((w) => w.id)).toEqual(['h1', 'h2'])
  })

  it('caps at the given limit (default 3)', () => {
    const p = profile(
      Array.from({ length: 6 }, (_, i) =>
        weakness({ id: `h${i}`, confidence: 0.05 + i * 0.02, lastExposedAt: daysAgo(0) }),
      ),
    )
    expect(hotWeaknesses(p, NOW)).toHaveLength(3)
    expect(hotWeaknesses(p, NOW, 2)).toHaveLength(2)
  })

  it('returns [] when nothing is hot', () => {
    const p = profile([
      weakness({ id: 'a', confidence: 0.2, lastExposedAt: daysAgo(40) }),
      weakness({ id: 'b', confidence: 0.9, lastExposedAt: daysAgo(0) }),
    ])
    expect(hotWeaknesses(p, NOW)).toEqual([])
  })
})
