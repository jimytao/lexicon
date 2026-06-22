import { useState } from 'react'
import type { SuggestItem } from '../../../types'
import { useT } from '../../../i18n'

interface PhrasesSectionProps {
  phrases: SuggestItem[]
  onPhraseClick: (word: string) => void
}

const COLLAPSE_THRESHOLD = 6

export function PhrasesSection({ phrases, onPhraseClick }: PhrasesSectionProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (phrases.length === 0) return null

  const needsCollapse = phrases.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? phrases.slice(0, COLLAPSE_THRESHOLD) : phrases

  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
        {t('phrases.heading')}
      </h2>
      <div className="space-y-1.5">
        {visible.map((p) => (
          <button
            key={p.word}
            onClick={() => onPhraseClick(p.word)}
            className="w-full flex items-center justify-between gap-2 text-left px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-sm text-gray-700 dark:text-gray-200 shrink-0">{p.word}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 text-right leading-relaxed">{p.zhBrief}</span>
          </button>
        ))}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-2 px-4"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? t('phrases.collapse') : `${t('phrases.showAll')} (${phrases.length})`}
        </button>
      )}
    </div>
  )
}
