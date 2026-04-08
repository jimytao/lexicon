import { useEffect, useRef } from 'react'
import type { SuggestItem } from '../../types'

interface SuggestListProps {
  items: SuggestItem[]
  onSelect: (word: string) => void
  visible: boolean
  activeIndex?: number
}

export function SuggestList({ items, onSelect, visible, activeIndex = -1 }: SuggestListProps) {
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!visible || items.length === 0) return null

  return (
    <ul className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-y-auto z-10 max-h-72">
      {items.map((item, i) => (
        <li key={item.word} ref={i === activeIndex ? activeRef : null}>
          <button
            className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
              i === activeIndex
                ? 'bg-indigo-50 dark:bg-indigo-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            onClick={() => onSelect(item.word)}
          >
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.word}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-4 shrink-0 max-w-[160px] truncate">{item.zhBrief}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
