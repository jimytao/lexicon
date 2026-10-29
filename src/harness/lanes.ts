/**
 * IN / OUT evidence lanes.
 *
 * The lane is decided by code when a search is submitted (see
 * utils/learningDirection.ts) and stamped onto every record. The AI is told which
 * lane it is looking at, but its own lane labels are never trusted.
 */
import type { LearningDirection, LearningRoute } from '../types'
import type { TextSource } from './provenance'

export const LANES: readonly LearningDirection[] = ['in', 'out']

export function isLane(value: unknown): value is LearningDirection {
  return value === 'in' || value === 'out'
}

export const LANE_TITLE: Record<LearningDirection, string> = {
  out: 'OUT LANE — the learner\'s own production (their writing, or what they want to say)',
  in: 'IN LANE — material the learner is reading or looking up (written by others)',
}

/** The searched / studied text belongs to the learner only on the OUT lane. */
export function querySource(route: LearningRoute): TextSource {
  return route === 'in' ? 'external' : 'learner'
}

export function partitionByLane<T extends { learningDirection?: LearningDirection }>(
  items: readonly T[],
): Record<LearningDirection, T[]> & { unattributed: T[] } {
  const out: T[] = []
  const inLane: T[] = []
  const unattributed: T[] = []
  for (const item of items) {
    if (item.learningDirection === 'out') out.push(item)
    else if (item.learningDirection === 'in') inLane.push(item)
    else unattributed.push(item)
  }
  return { in: inLane, out, unattributed }
}
