import { useState } from 'react'
import type { Meaning, Scene } from '../../../types'

interface MeaningListProps {
  meanings: Meaning[]
  scenes?: Scene[]
}

const COLLAPSE_THRESHOLD = 4

export function MeaningList({ meanings, scenes }: MeaningListProps) {
  const [expanded, setExpanded] = useState(false)

  const needsCollapse = meanings.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? meanings.slice(0, COLLAPSE_THRESHOLD) : meanings

  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">释义</h2>
      <ol className="space-y-3">
        {visible.map((m, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.zh}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{m.en}</p>
              {scenes?.[i] && (
                <div className="mt-1.5 rounded-lg px-3 py-2 bg-[#EEEDFE] dark:bg-[#2D2A5E]">
                  <span className="text-xs font-medium text-[#3C3489] dark:text-[#A09CF0]">
                    {scenes[i].label}
                  </span>
                  <p className="text-xs mt-1 text-[#3C3489] dark:text-[#A09CF0]">
                    {scenes[i].description}
                  </p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? '收起' : `展开更多 (${meanings.length - COLLAPSE_THRESHOLD})`}
        </button>
      )}
    </div>
  )
}
