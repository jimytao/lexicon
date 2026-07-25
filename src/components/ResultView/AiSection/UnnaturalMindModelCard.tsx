import type { UnnaturalMindModel } from '../../../types'
import { useT } from '../../../i18n'

interface UnnaturalMindModelCardProps {
  model: UnnaturalMindModel
}

export function UnnaturalMindModelCard({ model }: UnnaturalMindModelCardProps) {
  const t = useT()
  if (!model || (!model.chineseThought && !model.nativeConcept && !model.reusablePrinciple)) {
    return null
  }

  return (
    <div className="mt-3.5 mb-2 rounded-xl p-3.5 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-sm animate-in fade-in duration-300">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
          🧠
        </div>
        <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200 tracking-wide uppercase">
          {t('unnatural.title')}
        </h3>
      </div>

      <div className="space-y-2.5 text-xs">
        {model.chineseThought && (
          <div className="flex items-start gap-2 bg-amber-500/5 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-500/10">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
              {t('unnatural.chineseThought')}
            </span>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium pt-0.5">
              {model.chineseThought}
            </p>
          </div>
        )}

        {model.nativeConcept && (
          <div className="flex items-start gap-2 bg-teal-500/5 dark:bg-teal-950/30 p-2 rounded-lg border border-teal-500/10">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-200/80 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200">
              {t('unnatural.nativeConcept')}
            </span>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium pt-0.5">
              {model.nativeConcept}
            </p>
          </div>
        )}

        {model.reusablePrinciple && (
          <div className="flex items-start gap-2 bg-indigo-500/5 dark:bg-indigo-950/30 p-2 rounded-lg border border-indigo-500/10">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-200/80 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200">
              {t('unnatural.principle')}
            </span>
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed font-semibold pt-0.5">
              {model.reusablePrinciple}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
