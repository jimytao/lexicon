import { isExtension } from '../../services/platform'
import { useSettingsStore } from '../../stores/settingsStore'
import { useT } from '../../i18n'

/**
 * 设置 → 本地数据 → 网页选词按钮（**仅扩展平台**）。
 *
 * 与 DictionaryStorageRow 同样的模式：自带分隔线，非扩展平台整块消失，
 * 不会留下两条相邻的 RowDivider。
 */
export function SelectionButtonRow() {
  const t = useT()
  const selectionButtonEnabled = useSettingsStore((s) => s.selectionButtonEnabled)
  const setSelectionButtonEnabled = useSettingsStore((s) => s.setSelectionButtonEnabled)

  if (!isExtension()) return null

  return (
    <>
      <div className="border-t border-border/30 mx-4" />
      <button
        type="button"
        onClick={() => setSelectionButtonEnabled(!selectionButtonEnabled)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5 transition-colors cursor-pointer text-left"
      >
        <div className="flex-1 min-w-0 pr-3">
          <span className="text-sm font-bold text-foreground block">
            {t('settings.selectionButton')}
          </span>
          <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">
            {t('settings.selectionButtonDesc')}
          </p>
        </div>
        <div className="flex items-center h-7 px-1 shrink-0">
          <div
            className={`w-8 h-[18px] rounded-full transition-all duration-300 relative ${
              selectionButtonEnabled ? 'bg-accent' : 'bg-foreground/10'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${
                selectionButtonEnabled ? 'translate-x-3.5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>
      </button>
    </>
  )
}
