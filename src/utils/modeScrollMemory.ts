import type { Mode } from '../types'

export type ModeScrollPositions = Partial<Record<Mode, number>>

export function saveModeScrollPosition(
  positions: ModeScrollPositions,
  mode: Mode,
  scrollTop: number,
): ModeScrollPositions {
  return { ...positions, [mode]: Math.max(0, scrollTop) }
}

export function getModeScrollPosition(
  positions: ModeScrollPositions,
  mode: Mode,
  maxScrollTop: number,
): number {
  return Math.min(Math.max(0, positions[mode] ?? 0), Math.max(0, maxScrollTop))
}
