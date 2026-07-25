import type { CoreConcept } from '../../../types'
import { useT } from '../../../i18n'

interface CoreConceptCardProps {
  coreConcept?: CoreConcept
}

export function CoreConceptCard({ coreConcept }: CoreConceptCardProps) {
  const t = useT()
  if (!coreConcept || (!coreConcept.image && !coreConcept.explanation)) {
    return null
  }

  return (
    <div className="mb-3.5 rounded-2xl p-4 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 border border-indigo-500/20 dark:border-indigo-400/20 shadow-sm animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs shrink-0">
            🎯
          </div>
          <h2 className="text-xs font-bold tracking-wider text-indigo-950 dark:text-indigo-200 uppercase">
            {t('module.coreConcept')}
          </h2>
        </div>
      </div>

      <div className="space-y-2">
        <div className="px-3 py-2 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/10 border border-indigo-500/20">
          <span className="text-sm font-extrabold text-indigo-900 dark:text-indigo-100 tracking-wide">
            "{coreConcept.image}"
          </span>
        </div>
        {coreConcept.explanation && (
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium px-1">
            {coreConcept.explanation}
          </p>
        )}
      </div>
    </div>
  )
}
