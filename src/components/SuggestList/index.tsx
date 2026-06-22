import { useEffect, useRef } from 'react'
import type { SuggestItem } from '../../types'
import { useT } from '../../i18n'

type EnrichedSuggestItem = SuggestItem & { hasAiCache?: boolean; historyOnly?: boolean }

interface SuggestListProps {
  items: EnrichedSuggestItem[]
  onSelect: (word: string, isHistoryOnly: boolean) => void
  visible: boolean
  activeIndex?: number
}

export function SuggestList({ items, onSelect, visible, activeIndex = -1 }: SuggestListProps) {
  const t = useT()
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
            className={`w-full flex items-center gap-2 px-5 py-3 transition-colors ${
              i === activeIndex
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-foreground/5'
            }`}
            onClick={() => onSelect(item.word, !!item.historyOnly)}
          >
            <span className={`text-sm font-bold truncate min-w-0 flex-1 text-left ${
              i === activeIndex ? 'text-accent' : item.historyOnly ? 'text-foreground-muted' : 'text-foreground'
            }`}>
              {item.word}
            </span>
            {item.historyOnly && !item.hasAiCache && (
              <svg className="w-3 h-3 shrink-0 text-foreground-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {item.hasAiCache && (
              <svg className="w-3 h-3 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <title>{t('history.aiCached')}</title>
                <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            )}
            {!item.historyOnly && item.zhBrief && (
              <span className="text-xs text-foreground-muted shrink-0 max-w-[160px] truncate">{item.zhBrief}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
