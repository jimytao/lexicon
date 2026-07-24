import type { ConceptGraph } from '../../../types'

interface WordGraphCardProps {
  conceptGraph?: ConceptGraph
}

export function WordGraphCard({ conceptGraph }: WordGraphCardProps) {
  if (!conceptGraph || (!conceptGraph.rootCore && (!conceptGraph.branches || conceptGraph.branches.length === 0))) {
    return null
  }

  const { rootCore, branches = [] } = conceptGraph

  return (
    <div className="mb-3.5 rounded-2xl p-4 bg-white dark:bg-gray-900/40 border border-indigo-100 dark:border-indigo-900/30 shadow-sm animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-gray-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
            🕸️
          </div>
          <h2 className="text-xs font-bold text-gray-800 dark:text-gray-200 tracking-wider uppercase">
            Word Relationship & Concept Tree (词汇概念树状图谱)
          </h2>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold border border-indigo-200/50 dark:border-indigo-800/40">
          Mode 3 Pure Core
        </span>
      </div>

      {/* Root Node */}
      <div className="flex flex-col items-center mb-6">
        <div className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-extrabold text-xs shadow-md tracking-wide flex items-center gap-1.5 border border-indigo-400/30">
          <span>🎯 根意象:</span>
          <span>{rootCore}</span>
        </div>
        {/* Connector Line down */}
        <div className="w-0.5 h-4 bg-indigo-300 dark:bg-indigo-700/60 my-1" />
        <div className="w-3/4 max-w-md h-0.5 bg-indigo-200 dark:bg-indigo-800/50 rounded-full" />
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {branches.map((branch, idx) => (
          <div
            key={idx}
            className="flex flex-col rounded-xl p-3 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/30 transition-all duration-200 hover:border-indigo-300 dark:hover:border-indigo-700"
          >
            {/* Branch Header */}
            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-indigo-200/40 dark:border-indigo-900/40">
              <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
              <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                {branch.category}
              </h3>
            </div>

            {/* Examples list */}
            <div className="space-y-1 mt-auto">
              {branch.examples.map((ex, exIdx) => (
                <div
                  key={exIdx}
                  className="px-2 py-1 rounded-lg bg-white/80 dark:bg-gray-800/60 text-xs font-medium text-gray-700 dark:text-gray-300 border border-indigo-100/50 dark:border-gray-700/50 flex items-center gap-1.5"
                >
                  <span className="text-[10px] text-indigo-400 font-bold">›</span>
                  <span>{ex}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
