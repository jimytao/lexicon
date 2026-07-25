import { useState } from 'react'
import type { Example } from '../../../types'
import { useT } from '../../../i18n'
import { useSettingsStore } from '../../../stores/settingsStore'
import { SectionHeading } from '../SectionHeading'

interface ExampleListProps {
  examples: Example[]
  hideTranslation?: boolean
}

const COLLAPSE_THRESHOLD = 3

export function ExampleList({ examples, hideTranslation }: ExampleListProps) {
  const t = useT()
  const { monolingualWord } = useSettingsStore()
  const shouldHideTranslation = hideTranslation !== undefined ? hideTranslation : monolingualWord
  const [expanded, setExpanded] = useState(false)

  if (examples.length === 0) return null

  const needsCollapse = examples.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? examples.slice(0, COLLAPSE_THRESHOLD) : examples

  return (
    <div className="mb-4">
      <SectionHeading title={t('examples.heading')} />
      <div className="space-y-3">
        {visible.map((ex, i) => (
          <div key={i} className="relative pl-4 border-l-2 border-accent/20 hover:border-accent transition-colors py-1">
            <p className="text-sm font-bold text-foreground leading-relaxed">{ex.en}</p>
            {!shouldHideTranslation && ex.zh && ex.zh !== ex.en && (
              <p className="text-xs text-foreground-muted mt-1 font-medium">{ex.zh}</p>
            )}
          </div>
        ))}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-2 px-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? t('examples.collapse') : `${t('examples.showMore')} (${examples.length - COLLAPSE_THRESHOLD})`}
        </button>
      )}
    </div>
  )
}
