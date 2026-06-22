import type { Etymology } from '../../../types'
import { useT } from '../../../i18n'

interface EtymologyCardProps {
  etymology: Etymology
}

export function EtymologyCard({ etymology }: EtymologyCardProps) {
  const t = useT()
  if (!etymology?.parts) return null
  const anchorParts = etymology.parts.filter(p => p.anchor)

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">{t('etymology.heading')}</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          {t('etymology.aiLabel')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {etymology.parts.map((part, i) => (
          <div key={i} className="rounded-full px-2.5 py-1 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200">
            <span className="font-semibold">{part.segment}</span>
            <span className="mx-1 opacity-50">·</span>
            <span>{part.meaning}</span>
            {part.sourceForm && (
              <>
                <span className="mx-1 opacity-30">·</span>
                <span className="opacity-55 italic">{part.sourceForm}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-2">{etymology.story}</p>
      {anchorParts.length > 0 && (
        <div className="mb-3 px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">{t('etymology.anchors')}</div>
          <div className="space-y-1.5">
            {anchorParts.map((part, i) => (
              <div key={i} className="text-xs">
                <span className="font-semibold text-amber-600 dark:text-amber-300">{part.anchor}</span>
                <span className="text-amber-500/60 dark:text-amber-500/50 mx-1">←</span>
                <span className="text-amber-800/70 dark:text-amber-200/60 italic mr-1.5">{part.segment}</span>
                {part.anchorNote && (
                  <span className="text-gray-500 dark:text-gray-400">{part.anchorNote}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
