import { useCallback, useEffect, useState } from 'react'
import { isExtension } from '../../services/platform'
import { useDictionaryStore } from '../../stores/dictionaryStore'
import { useT } from '../../i18n'
import type { InstalledDictionary } from '../../services/db.extension'

/**
 * 设置 → 本地数据 → 词库管理（**仅扩展平台**）。
 *
 * 其他平台词库随包分发，没有「已下载 / 释放空间」的概念，所以这里直接返回 null。
 * `db.extension` 必须动态 import —— 静态引入会把 OPFS 那套代码打进
 * Web / Tauri / Capacitor 的主 chunk。
 */
export function DictionaryStorageRow() {
  const t = useT()
  const [installed, setInstalled] = useState<InstalledDictionary[] | null>(null)
  const [busy, setBusy] = useState(false)
  // 下载完成后要刷新列表，所以跟着 phase 走
  const phase = useDictionaryStore((s) => s.phase)

  const refresh = useCallback(async () => {
    const mod = await import('../../services/db.extension')
    setInstalled(await mod.listInstalledDictionaries())
  }, [])

  useEffect(() => {
    if (!isExtension()) return
    void refresh()
  }, [refresh, phase])

  if (!isExtension()) return null

  const totalBytes = (installed ?? []).reduce((sum, d) => sum + d.bytes, 0)
  const isEmpty = !installed || installed.length === 0

  const desc = isEmpty
    ? t('settings.dictNone')
    : `${(installed ?? [])
        .map((d) => `${d.dict === 'enen' ? t('settings.dictShortEnEn') : t('settings.dictShortEnZh')} ${d.version}`)
        .join(' · ')} · ${(totalBytes / 1048576).toFixed(1)} MB`

  return (
    <>
      {/* 分隔线由本组件自带：非扩展平台整块消失时不会留下重复分隔线。
          与 SettingsView 的 RowDivider 同款样式。 */}
      <div className="border-t border-border/30 mx-4" />
      <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0 pr-3">
        <span className="text-sm font-bold text-foreground block">{t('settings.dictStorage')}</span>
        <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{desc}</p>
      </div>
      <button
        type="button"
        disabled={isEmpty || busy}
        onClick={() => {
          if (!confirm(t('settings.dictClearConfirm'))) return
          setBusy(true)
          void (async () => {
            try {
              const mod = await import('../../services/db.extension')
              await mod.removeInstalledDictionaries()
              await refresh()
            } finally {
              setBusy(false)
            }
          })()
        }}
        className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
      >
        {t('settings.dictClear')}
      </button>
      </div>
    </>
  )
}
