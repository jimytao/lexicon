import type { CollocationData } from '../../../types'
import { useT } from '../../../i18n'

interface CollocationCardProps {
  collocations?: CollocationData
}

export function CollocationCard({ collocations }: CollocationCardProps) {
  const t = useT()

  if (!collocations) return null

  const { chunks = [], collocations: colls = [] } = collocations
  if (chunks.length === 0 && colls.length === 0) return null

  return (
    <div className="mb-3 rounded-xl p-3.5 bg-white dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800/40 shadow-sm animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-100/80 dark:border-gray-800/50 pb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t('collocations.heading')}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chunks Section */}
        {chunks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 border-b border-purple-50/50 dark:border-purple-950/20 pb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <h3 className="text-xs font-bold text-purple-950 dark:text-purple-300 tracking-wider">
                {t('collocations.chunks')}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {chunks.map((item, idx) => (
                <div
                  key={idx}
                  className="group relative px-3 py-1.5 rounded-xl border border-purple-100/60 dark:border-purple-900/30 bg-purple-50/60 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 transition-all duration-200 hover:bg-purple-100/80 dark:hover:bg-purple-900/60 cursor-help flex flex-col"
                >
                  <span className="text-xs font-semibold">{item.chunk}</span>
                  {item.spatialExtension && item.spatialExtension !== 'N/A' && item.spatialExtension !== 'null' && (
                    <span className="text-[10px] font-normal text-purple-700 dark:text-purple-300 mt-0.5 flex items-center gap-0.5">
                      <span>🧭</span> {item.spatialExtension}
                    </span>
                  )}
                  {item.note && item.note !== 'N/A' && item.note !== 'null' && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 text-[10px] rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                      {item.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collocations Section */}
        {colls.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 border-b border-teal-50/50 dark:border-teal-950/20 pb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              <h3 className="text-xs font-bold text-teal-950 dark:text-teal-300 tracking-wider">
                {t('collocations.collocations')}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {colls.map((item, idx) => (
                <div
                  key={idx}
                  className="group relative px-3 py-1.5 rounded-xl border border-teal-100/60 dark:border-teal-900/30 bg-teal-50/60 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 transition-all duration-200 hover:bg-teal-100/80 dark:hover:bg-teal-900/60 cursor-help"
                >
                  <span className="text-xs font-semibold">{item.chunk}</span>
                  {item.note && item.note !== 'N/A' && item.note !== 'null' && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 text-[10px] rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                      {item.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
