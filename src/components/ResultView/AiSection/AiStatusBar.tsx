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
          <div key={i} className="h-6 w-20 rounded-full bg-foreground/5 animate-pulse" />
        ))}
      </div>
    )
  }
  return (
    <div className="mb-4 space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-foreground/5 animate-pulse" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
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
      <div className="flex items-center gap-2 mb-3 text-xs text-foreground-muted font-medium">
        <svg className="w-3.5 h-3.5 animate-spin text-accent" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {t('status.loading')}
      </div>
    )
  }

  if (status === 'error') {
    const isConfigError = error?.toLowerCase().includes('config') || error?.toLowerCase().includes('api key') || error?.toLowerCase().includes('endpoint')

    if (isConfigError) {
      return (
        <div className="my-4 rounded-2xl border border-border/50 bg-background-soft/40 p-4">
          <h3 className="text-sm font-bold text-foreground">{t('status.notConfigured.title')}</h3>
          <p className="text-xs leading-relaxed text-foreground-muted mt-1">
            {t('status.notConfigured.body')}
          </p>
          <div className="flex items-center gap-3 pt-3">
            {onGoToSettings && (
              <button
                onClick={onGoToSettings}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-accent text-white shadow-sm whitespace-nowrap cursor-pointer"
              >
                {t('status.goToSettings')}
              </button>
            )}
            <button
              onClick={onRetry}
              className="text-xs font-bold px-4 py-2 rounded-xl border border-border text-foreground hover:bg-foreground/5 whitespace-nowrap cursor-pointer"
            >
              {t('status.retry')}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="my-4 rounded-2xl border border-border/50 bg-background-soft/40 p-4">
        <h3 className="text-sm font-bold text-foreground">{t('status.error.title')}{word ? ` — "${word}"` : ''}</h3>
        <p className="text-xs leading-relaxed text-foreground-muted font-mono select-all mt-1">
          {error || t('error.unknown')}
        </p>
        <div className="flex items-center gap-3 pt-3">
          <button
            onClick={onRetry}
            className="text-xs font-bold px-4 py-2 rounded-xl bg-accent text-white shadow-sm whitespace-nowrap cursor-pointer"
          >
            {t('status.tryAgain')}
          </button>
          {onGoToSettings && (
            <button
              onClick={onGoToSettings}
              className="text-xs font-bold px-4 py-2 rounded-xl border border-border text-foreground hover:bg-foreground/5 whitespace-nowrap cursor-pointer"
            >
              {t('status.checkSettings')}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
