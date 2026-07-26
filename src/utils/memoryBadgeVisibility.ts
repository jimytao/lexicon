import { flattenAiConversations, parseAiConversationsBuckets } from './aiConversations'

/** Which LexiconMemoryBadge chips are allowed to render. */
export type MemoryBadgeKind = 'notes' | 'qaFollowUps' | 'coreSaved'

export interface MemoryBadgeSignals {
  hasNotes: boolean
  qaCount: number
  hasCoreSaved: boolean
}

/**
 * Product policy (2026-07): hide the "N AI follow-ups" chip.
 * Chat history still persists; only the top-of-result branding badge is removed.
 */
export function getVisibleMemoryBadges(signals: MemoryBadgeSignals): MemoryBadgeKind[] {
  const visible: MemoryBadgeKind[] = []
  if (signals.hasNotes) visible.push('notes')
  // qaFollowUps intentionally omitted — do not surface AI follow-up count badge
  if (signals.hasCoreSaved) visible.push('coreSaved')
  return visible
}

/** Counts user turns across Lookup + Core conversation buckets (legacy array OK). */
export function countUserQaMessages(aiConversationsJson: string | null | undefined): number {
  if (!aiConversationsJson) return 0
  return flattenAiConversations(parseAiConversationsBuckets(aiConversationsJson)).filter(
    (m) => m.role === 'user',
  ).length
}
