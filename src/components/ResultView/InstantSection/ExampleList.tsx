import { useState } from 'react'
import type { Example } from '../../../types'

interface ExampleListProps {
  examples: Example[]
}

const COLLAPSE_THRESHOLD = 3

export function ExampleList({ examples }: ExampleListProps) {
  const [expanded, setExpanded] = useState(false)

  if (examples.length === 0) return null

  const needsCollapse = examples.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? examples.slice(0, COLLAPSE_THRESHOLD) : examples

  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">例句</h2>
      <ul className="space-y-3">
        {visible.map((ex, i) => (
          <li key={i} className="border-l-2 border-gray-200 dark:border-gray-600 pl-3">
            <p className="text-sm text-gray-800 dark:text-gray-100">{ex.en}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ex.zh}</p>
          </li>
        ))}
      </ul>

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
          {expanded ? '收起' : `展开更多 (${examples.length - COLLAPSE_THRESHOLD})`}
        </button>
      )}
    </div>
  )
}
