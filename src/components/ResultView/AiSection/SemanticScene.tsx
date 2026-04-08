import type { Scene } from '../../../types'

interface SemanticSceneProps {
  meanings: Array<{ zh: string; scene: Scene }>
}

export function SemanticScene({ meanings }: SemanticSceneProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">语义情景</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          AI 解析
        </span>
      </div>
      <div className="space-y-2">
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
    </div>
  )
}
