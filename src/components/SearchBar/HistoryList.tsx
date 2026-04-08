import { useHistoryStore } from '../../stores/historyStore'

interface HistoryListProps {
  onSelect: (word: string) => void
}

export function HistoryList({ onSelect }: HistoryListProps) {
  const { words, remove, clear } = useHistoryStore()

  if (words.length === 0) return null

  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-10 max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-400 dark:text-gray-500">最近查词</span>
        <button
          onClick={clear}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          清除全部
        </button>
      </div>
      <ul>
        {words.map((word) => (
          <li key={word} className="flex items-center group">
            <button
              className="flex-1 flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              onClick={() => onSelect(word)}
            >
              <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300">{word}</span>
            </button>
            <button
              onClick={() => remove(word)}
              className="pr-4 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="删除"
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
