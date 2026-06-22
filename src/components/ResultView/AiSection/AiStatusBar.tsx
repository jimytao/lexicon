import type { AiStatus } from '../../../stores/resultStore'
import { useT } from '../../../i18n'

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
  word?: string
  onGoToSettings?: () => void
}

export function AiStatusBar({ status, error, onRetry, word, onGoToSettings }: AiStatusBarProps) {
  const t = useT()
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 mb-3 text-xs text-indigo-500 dark:text-indigo-400 font-semibold animate-pulse">
        <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
        {t('status.loading')}
      </div>
    )
  }

  if (status === 'error') {
    const isConfigError = error?.toLowerCase().includes('config') || error?.toLowerCase().includes('api key') || error?.toLowerCase().includes('endpoint')

    if (isConfigError) {
      return (
        <div className="my-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-amber-600/10 p-6 backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">{t('status.notConfigured.title')}</h3>
              <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-400/80 mt-1">
                {t('status.notConfigured.body')}
              </p>
              <div className="flex items-center gap-3 pt-3">
                {onGoToSettings && (
                  <button
                    onClick={onGoToSettings}
                    className="text-xs font-bold px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    {t('status.goToSettings')}
                  </button>
                )}
                <button
                  onClick={onRetry}
                  className="text-xs font-bold px-4 py-2 rounded-full border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/5 active:scale-95 transition-all cursor-pointer"
                >
                  {t('status.retry')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="my-4 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-rose-600/10 p-6 backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1 flex-1">
            <h3 className="text-sm font-bold text-rose-900 dark:text-rose-300">{t('status.error.title')}{word ? ` — "${word}"` : ''}</h3>
            <p className="text-xs leading-relaxed text-rose-800/80 dark:text-rose-400/80 font-mono select-all mt-1">
              {error || 'Unknown network or API error'}
            </p>
            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={onRetry}
                className="text-xs font-bold px-4 py-2 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                {t('status.tryAgain')}
              </button>
              {onGoToSettings && (
                <button
                  onClick={onGoToSettings}
                  className="text-xs font-bold px-4 py-2 rounded-full border border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/5 active:scale-95 transition-all cursor-pointer"
                >
                  {t('status.checkSettings')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

