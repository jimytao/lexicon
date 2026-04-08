import type { AiStatus } from '../../../stores/resultStore'

interface SkeletonBlockProps {
  lines?: number
  variant?: 'text' | 'pill' | 'card'
}

export function SkeletonBlock({ lines = 2, variant = 'text' }: SkeletonBlockProps) {
  if (variant === 'pill') {
    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-6 w-20 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    )
  }
  return (
    <div className="mb-4 space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

interface AiStatusBarProps {
  status: AiStatus
  error: string | null
  onRetry: () => void
}

export function AiStatusBar({ status, error, onRetry }: AiStatusBarProps) {
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 mb-3 text-xs text-indigo-400 dark:text-indigo-400">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        AI 解析中…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 mb-3 text-xs text-red-500">
        <span>AI 解析失败：{error}</span>
        <button onClick={onRetry} className="underline">重试</button>
      </div>
    )
  }
  return null
}
