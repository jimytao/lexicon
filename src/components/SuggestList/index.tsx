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
    <ul className="max-h-72 overflow-y-auto py-1">
      {items.map((item, i) => (
        <li key={item.word} ref={i === activeIndex ? activeRef : null}>
          <button
            className={`w-full flex items-center justify-between px-5 py-3 transition-colors ${
              i === activeIndex
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-foreground/5'
            }`}
            onClick={() => onSelect(item.word)}
          >
            <span className={`text-sm font-bold ${i === activeIndex ? 'text-accent' : 'text-foreground'}`}>{item.word}</span>
            <span className="text-xs text-foreground-muted ml-4 shrink-0 max-w-[160px] truncate">{item.zhBrief}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
