import { useState } from 'react'
import { useHistoryStore } from '../../stores/historyStore'
import { useResultStore } from '../../stores/resultStore'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'

interface HistoryListProps {
  onSelect: (word: string) => void
}

export function HistoryList({ onSelect }: HistoryListProps) {
  const t = useT()
  const { words, remove, clear } = useHistoryStore()
  const { aiCache, aiFullCache, phraseCache, evictCacheEntry } = useResultStore()
  const [expandedWords, setExpandedWords] = useState<Set<string>>(() => new Set())

  if (words.length === 0) return null

  function toggleExpanded(word: string) {
    setExpandedWords((current) => {
      const next = new Set(current)
      if (next.has(word)) {
        next.delete(word)
      } else {
        next.add(word)
      }
      return next
    })
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50 bg-foreground/[0.02]">
        <span className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">{t('history.title')}</span>
        <button
          type="button"
          onClick={() => { clear(); useChatStore.getState().clearAll(); }}
          className="text-[10px] font-bold text-accent hover:text-accent/80 transition-colors"
        >
          {t('history.clearAll')}
        </button>
      </div>
      <ul className="py-1">
        {words.map((entry) => {
          const word = entry.word
          const isExpanded = expandedWords.has(word)
          const canExpand = word.length > 36
          const hasCachedAi = !!(aiCache[word] || aiFullCache[word] || phraseCache[word])
          const hasAiIntent = entry.aiMode !== null

          return (
            <li key={word} className="flex items-start group min-w-0">
              <button
                type="button"
                className="flex-1 min-w-0 flex items-start gap-3 px-5 py-3 hover:bg-foreground/5 transition-colors text-left"
                onClick={() => onSelect(word)}
              >
                <svg className="w-4 h-4 mt-0.5 text-foreground-muted/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-sm font-medium text-foreground min-w-0 flex-1 ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>
                  {word}
                </span>
                {(hasCachedAi || hasAiIntent) && (
                  <svg
                    className={`w-3 h-3 shrink-0 mt-0.5 transition-opacity ${hasCachedAi ? 'text-amber-400 opacity-100' : 'text-amber-400 opacity-40'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>{t('history.aiCached')}</title>
                    <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                )}
              </button>
              {canExpand && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(word)}
                  className="shrink-0 px-2 py-3 text-foreground-muted/40 hover:text-foreground-muted transition-colors"
                  aria-label={isExpanded ? t('history.collapse') : t('history.expand')}
                  title={isExpanded ? t('history.collapse') : t('history.expand')}
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => { evictCacheEntry(word); useChatStore.getState().clearMessages(word); remove(word) }}
                className="shrink-0 py-3 pr-5 pl-2 text-foreground-muted/30 hover:text-foreground-muted opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                aria-label={t('history.delete')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
