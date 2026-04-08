import type { Etymology } from '../../../types'

interface EtymologyCardProps {
  etymology: Etymology
}

export function EtymologyCard({ etymology }: EtymologyCardProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">词根词缀</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          AI 解析
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {etymology.parts.map((part, i) => (
          <div key={i} className="rounded-full px-2.5 py-1 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200">
            <span className="font-semibold">{part.segment}</span>
            <span className="mx-1 opacity-50">·</span>
            <span>{part.meaning}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{etymology.story}</p>
      {etymology.derivedWords && etymology.derivedWords.length > 0 && (
        <div className="space-y-1">
          {etymology.derivedWords.map((dw, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold text-gray-800 dark:text-gray-200 w-28 shrink-0">{dw.word}</span>
              <span className="text-gray-400 dark:text-gray-500 w-10 shrink-0">{dw.pos}</span>
              <span className="text-gray-500 dark:text-gray-400">{dw.meaning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
