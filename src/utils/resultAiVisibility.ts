import type { Mode } from '../types'
import type { AiStatus, QuerySkeleton } from '../stores/resultStore'

/** A skeleton is readable content while its full half remains in flight. */
export function shouldShowAiPreview(opts: {
  status: AiStatus
  pending: boolean
  isPartial: boolean
  skeleton: QuerySkeleton | null
  correctForm?: string
}): boolean {
  if (opts.status !== 'loading' || !opts.pending || !opts.isPartial || !opts.skeleton) return false
  // beginCombined clears the skeleton; matching the normalized result also keeps
  // a previous result still held in the store from becoming a preview accidentally.
  return !!opts.correctForm && (!opts.skeleton.correctForm || opts.correctForm === opts.skeleton.correctForm)
}

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
