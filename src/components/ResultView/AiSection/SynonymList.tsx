import type { Synonym } from '../../../types'

interface SynonymListProps {
  synonyms: Synonym[]
  onSynonymClick: (word: string) => void
}

export function SynonymList({ synonyms, onSynonymClick }: SynonymListProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">近义词辨析</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          AI 解析
        </span>
      </div>
      <div className="space-y-2">
        {synonyms.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <button
              onClick={() => onSynonymClick(s.word)}
              className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full underline-offset-2 hover:underline cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200"
            >
              {s.word}
            </button>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{s.distinction}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
