import type { Mode } from '../types'
import type { SearchTag } from './combinedResult'

export interface HistoryDecisionInput {
  hasNormalCache: boolean
  hasBypassCache: boolean
}

export interface HistoryDecisionResult {
  /** Target searchSource for App rendering: 'local' (dictionary L1 view) or 'ai-full' (pure AI page) */
  searchSource: 'local' | 'ai-full'
  /** Target search mode: 'instant' (when no AI cache exists) or 'ai' */
  mode: Mode
  /** Active tag to load from combinedCache if mode === 'ai' */
  activeTag: SearchTag | null
}

/**
 * Evaluates history item click decision tree:
 * 1. Neither normal nor bypass cached -> mode = 'instant', searchSource = 'local'
 * 2. Both cached -> mode = 'ai', searchSource = 'local', activeTag = 'normal'
 * 3. Only normal cached -> mode = 'ai', searchSource = 'local', activeTag = 'normal'
 * 4. Only bypass cached -> mode = 'ai', searchSource = 'ai-full', activeTag = 'bypass'
 */
export function decideHistoryClickRoute(input: HistoryDecisionInput): HistoryDecisionResult {
  if (input.hasNormalCache && input.hasBypassCache) {
    return { mode: 'ai', searchSource: 'local', activeTag: 'normal' }
  }
  if (input.hasNormalCache) {
    return { mode: 'ai', searchSource: 'local', activeTag: 'normal' }
  }
  if (input.hasBypassCache) {
    return { mode: 'ai', searchSource: 'ai-full', activeTag: 'bypass' }
  }
  return { mode: 'instant', searchSource: 'local', activeTag: null }
}
