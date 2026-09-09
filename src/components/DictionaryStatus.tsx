import { useState } from 'react'
import { useDictionaryStore } from '../stores/dictionaryStore'
import { warmupDictionary } from '../services/db'
import { useT } from '../i18n'

/**
 * 扩展首启时的词库下载状态。
 *
 * 刻意做成**纯文字 + 一条细进度条**，用来替换空态里那两行提示文案，
 * 而不是往首页加一张卡片 —— 09-ui-ux-design-system.md §2.2 规定
 * 空态必须保持极简、禁止浮动卡片。
 *
 * 词库没落地前 App 实际不可用，所以这里占据提示文案的位置是恰当的：
 * 它不是附加信息，它就是此刻唯一该说的话。
 */

function formatBytes(n: number): string {
  if (n <= 0) return '0 MB'
  return `${(n / 1048576).toFixed(1)} MB`
}

export function DictionaryStatus() {
  const t = useT()
  const { phase, receivedBytes, totalBytes, error } = useDictionaryStore()
  const [retrying, setRetrying] = useState(false)

  // ready / idle 时不接管空态文案
  if (phase === 'idle' || phase === 'ready') return null

  if (phase === 'error') {
    return (
      <div className="max-w-[270px] mx-auto text-center">
        <p className="text-xs font-medium text-red-500 leading-relaxed">
          {t('dict.downloadFailed')}
        </p>
        {error && (
          <p className="mt-1 text-[10px] text-foreground-muted/60 leading-snug break-words">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            setRetrying(true)
            useDictionaryStore.getState().reset()
            void warmupDictionary().finally(() => setRetrying(false))
          }}
          className="pointer-events-auto mt-3 px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-foreground/5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
        >
          {t('dict.retry')}
        </button>
      </div>
    )
  }

  const label =
    phase === 'checking' ? t('dict.checking')
    : phase === 'verifying' ? t('dict.verifying')
    : t('dict.downloading')

  // content-length 缺失时 totalBytes 为 0 —— 退化成不确定进度，别显示假的百分比
  const hasTotal = totalBytes > 0
  const pct = hasTotal ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0

  return (
    <div className="max-w-[270px] mx-auto text-center">
      <p className="text-xs font-medium text-foreground-muted/70 leading-relaxed">{label}</p>

      <div className="mt-3 h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
        <div
          className={`h-full bg-accent transition-all duration-300 ${hasTotal ? '' : 'animate-pulse w-1/3'}`}
          style={hasTotal ? { width: `${pct}%` } : undefined}
        />
      </div>

      {phase === 'downloading' && (
        <p className="mt-2 text-[10px] font-medium text-foreground-muted/50 tabular-nums">
          {hasTotal
            ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)} · ${pct}%`
            : formatBytes(receivedBytes)}
        </p>
      )}

      <p className="mt-2 text-[10px] text-foreground-muted/50 leading-snug">
        {t('dict.oneTimeHint')}
      </p>
    </div>
  )
}
