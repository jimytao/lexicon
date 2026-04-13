import type { Mode } from '../../types'

interface ModeToggleProps {
  mode: Mode
  onModeChange: (m: Mode) => void
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex gap-1">
      <button
        onClick={() => onModeChange('instant')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          mode === 'instant'
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        Instant
      </button>
      <button
        onClick={() => onModeChange('ai')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          mode === 'ai'
            ? 'text-white'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        style={mode === 'ai' ? { backgroundColor: '#3C3489' } : {}}
      >
        AI mode
      </button>
    </div>
  )
}
