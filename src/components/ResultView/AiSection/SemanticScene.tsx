import { useState } from 'react'
import type { Scene } from '../../../types'

interface SemanticSceneProps {
  meanings: Array<{ zh: string; scene: Scene }>
  defaultCollapsed?: boolean
}

export function SemanticScene({ meanings, defaultCollapsed = false }: SemanticSceneProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  return (
    <div className="mb-4">
      <div 
        className="flex items-center gap-1.5 mb-2 cursor-pointer select-none group"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">语义情景</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          AI 解析
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-gray-400 group-hover:text-indigo-500 transition-colors">
            {isCollapsed ? '展开' : '折叠'}
          </span>
          <svg 
            className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} 
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {meanings.map((m, i) => (
            <div key={i} className="rounded-lg px-3 py-2.5 bg-indigo-50 dark:bg-indigo-900/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">{i + 1}</span>
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">{m.scene.label}</span>
              </div>
              <p className="text-xs leading-relaxed text-indigo-900 dark:text-indigo-200">{m.scene.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
