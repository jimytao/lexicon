import type { Mode } from '../types'
import type { AiStatus } from '../stores/resultStore'

/** Lookup ResultView: Chat is an AI surface — Instant must not show it. */
export function shouldShowResultAiChat(mode: Mode, aiStatus: AiStatus): boolean {
  if (mode !== 'ai') return false
  return aiStatus === 'success'
}

/**
 * Prep imagery module for Lookup word views.
 * Core never uses this (chunks instead). Empty prep list → hide slot.
 */
export function shouldShowPrepImageryModule(opts: {
  moduleEnabled: boolean
  searchMode: Mode
  prepositions: string[]
}): boolean {
  const { moduleEnabled, searchMode, prepositions } = opts
  if (!moduleEnabled) return false
  if (searchMode === 'core' || searchMode === 'instant') return false
  return prepositions.length > 0
}
