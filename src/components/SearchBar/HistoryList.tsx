import { useHistoryStore } from '../../stores/historyStore'

interface HistoryListProps {
  onSelect: (word: string) => void
}

export function HistoryList({ onSelect }: HistoryListProps) {
  const { words, remove, clear } = useHistoryStore()

  if (words.length === 0) return null

  return (
    <div className="max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50 bg-foreground/[0.02]">
        <span className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">History</span>
        <button
          onClick={clear}
          className="text-[10px] font-bold text-accent hover:text-accent/80 transition-colors"
        >
          CLEAR ALL
        </button>
      </div>
      <ul className="py-1">
        {words.map((word) => (
          <li key={word} className="flex items-center group">
            <button
              className="flex-1 flex items-center gap-3 px-5 py-3 hover:bg-foreground/5 transition-colors text-left"
              onClick={() => onSelect(word)}
            >
              <svg className="w-4 h-4 text-foreground-muted/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-foreground">{word}</span>
            </button>
            <button
              onClick={() => remove(word)}
              className="pr-5 text-foreground-muted/30 hover:text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
