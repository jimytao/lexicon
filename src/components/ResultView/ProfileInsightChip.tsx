import { useState } from 'react'
import { useT } from '../../i18n'
import { useSearchStore } from '../../stores/searchStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { LearningDirection, LearningRoute } from '../../types'
import { resolveLearningRoute } from '../../utils/learningDirection'

const DISMISS_KEY = 'lexicon-dismissed-insights'

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistDismissed(set: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

interface ProfileInsightChipProps {
  /** One short sentence from the AI linking this result to a recurring weak spot. */
  insight?: string | null
  /** Stable key (normalised query) so a per-session dismiss sticks to this query. */
  dismissKey: string
  /** Original query used to validate the route when the AI corrected or translated the display form. */
  routeQuery?: string
  /** Immutable route captured when the active search was submitted. */
  learningRoute?: LearningRoute
  /** Lane that produced this insight. Legacy cached insights omit it and stay hidden. */
  direction?: LearningDirection
  /** Open the learner profile (currently: navigate to Settings). */
  onOpen: () => void
}

/**
 * Direction A — ambient "this connects to your weak spot" chip. Renders only when
 * the AI decided the current word/phrase genuinely relates to a hot weakness, and
 * only until the learner dismisses it for this query this session.
 */
export function ProfileInsightChip({ insight, dismissKey, routeQuery, learningRoute, direction, onOpen }: ProfileInsightChipProps) {
  const t = useT()
  const selectedDirection = useSearchStore(s => s.learningDirection)
  const { mainDictionary, monolingualWord, monolingualPhrase, monolingualSentence } = useSettingsStore()
  const dictionaryRouting = { mainDictionary, monolingualWord, monolingualPhrase, monolingualSentence }
  const [dismissed, setDismissed] = useState(() => readDismissed().has(dismissKey))

  const text = insight?.trim()
  const currentRoute = learningRoute ?? resolveLearningRoute(routeQuery || dismissKey, selectedDirection, dictionaryRouting)
  if (!text || !direction || direction !== currentRoute || dismissed) return null

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = readDismissed()
    next.add(dismissKey)
    persistDismissed(next)
    setDismissed(true)
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-start gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] dark:bg-accent/[0.07] px-3 py-2 transition-colors hover:bg-accent/[0.08] cursor-pointer"
    >
      <span className="text-xs leading-none mt-0.5 shrink-0" aria-hidden>🧠</span>
      <span className="flex-1 min-w-0 text-[11px] leading-snug text-foreground-muted">
        <span className="font-bold text-accent/80">{t('profile.insightPrefix')} </span>
        {text}
      </span>
      <span
        role="button"
        tabIndex={-1}
        aria-label={t('profile.insightDismiss')}
        onClick={handleDismiss}
        className="shrink-0 -mr-1 -mt-0.5 w-5 h-5 flex items-center justify-center rounded-md text-foreground-muted/50 hover:text-foreground hover:bg-foreground/5 transition-colors text-xs"
      >
        ✕
      </span>
    </button>
  )
}
