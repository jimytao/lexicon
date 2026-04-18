import type { TextBlock } from '../../types'

interface Props {
  blocks: TextBlock[]
  onUpdateTranslation: (index: number, translation: string) => void
  onUpdateBlock?: (index: number, partial: Partial<TextBlock>) => void
  selectedIndex?: number
  selectedLayer?: 1 | 2
  onSelect?: (index: number, layer?: 1 | 2) => void
  onDeselect?: () => void
  onDrawL1?: (index: number) => void
}

export function TranslationList({
  blocks, onUpdateTranslation, onUpdateBlock,
  selectedIndex, selectedLayer = 2, onSelect, onDeselect, onDrawL1,
}: Props) {
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">未检测到文字</p>
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const hasPolygon = !!(block.polygon && block.polygon.length >= 3)
        const isSelectedL1 = selectedIndex === i && selectedLayer === 1
        const isSelectedL2 = selectedIndex === i && selectedLayer === 2
        const isSelected = selectedIndex === i

        // ── Polygon block: two cards ──
        if (hasPolygon && onUpdateBlock) {
          return (
            <div key={i} className="space-y-1">
              {/* Layer 1 — background polygon */}
              <div
                id={`block-item-${i}-1`}
                onClick={(e) => { e.stopPropagation(); onSelect?.(i, 1) }}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelectedL1
                    ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">L1 背景层</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">多边形</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    block.type === 'sfx' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                    block.type === 'caption' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                    'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {block.type === 'sfx' ? '音效' : block.type === 'caption' ? '标注' : '对话'}
                  </span>
                  {onDrawL1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDrawL1(i) }}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                    >
                      手动绘制L1
                    </button>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">#{i + 1}</span>
                </div>
                {/* Color controls always visible for L1 when this mode has onUpdateBlock */}
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">色调</span>
                    <input
                      type="range" min={-180} max={180} step={1}
                      value={block.l1ColorHue ?? 0}
                      onChange={(e) => onUpdateBlock(i, { l1ColorHue: Number(e.target.value) })}
                      className="flex-1 h-1.5 accent-purple-500"
                    />
                    <span className="text-[11px] text-gray-400 w-8 text-right">{block.l1ColorHue ?? 0}°</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">饱和</span>
                    <input
                      type="range" min={0} max={2} step={0.05}
                      value={block.l1ColorSaturation ?? 1}
                      onChange={(e) => onUpdateBlock(i, { l1ColorSaturation: Number(e.target.value) })}
                      className="flex-1 h-1.5 accent-purple-500"
                    />
                    <span className="text-[11px] text-gray-400 w-8 text-right">{((block.l1ColorSaturation ?? 1) * 100).toFixed(0)}%</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">透明</span>
                    <input
                      type="range" min={0} max={1} step={0.02}
                      value={block.l1ColorOpacity ?? 1}
                      onChange={(e) => onUpdateBlock(i, { l1ColorOpacity: Number(e.target.value) })}
                      className="flex-1 h-1.5 accent-purple-500"
                    />
                    <span className="text-[11px] text-gray-400 w-8 text-right">{((block.l1ColorOpacity ?? 1) * 100).toFixed(0)}%</span>
                  </label>
                </div>
              </div>

              {/* Layer 2 — text */}
              <div
                id={`block-item-${i}-2`}
                onClick={(e) => { e.stopPropagation(); onSelect?.(i, 2) }}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelectedL2
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">L2 文字层</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {block.direction === 'vertical' ? '竖排' : '横排'}
                  </span>
                  {block.rotation ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {block.rotation}°
                    </span>
                  ) : null}
                </div>
                {block.original && (
                  <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{block.original}</p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">译文</p>
                <textarea
                  value={block.translation}
                  rows={1}
                  ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                  onChange={(e) => {
                    onUpdateTranslation(i, e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="输入译文"
                  className="w-full text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none overflow-hidden"
                />
              </div>
            </div>
          )
        }

        // ── Non-polygon block: single card ──
        const showColor = isSelected && (block.type === 'bubble' || block.type === 'caption')
        return (
          <div
            key={i}
            id={`block-item-${i}`}
            onClick={(e) => { e.stopPropagation(); onSelect?.(i, 2) }}
            className={`rounded-lg border p-3 cursor-pointer transition-colors ${
              isSelected
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">原文</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                block.type === 'sfx' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                block.type === 'caption' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {block.type === 'sfx' ? '音效' : block.type === 'caption' ? '标注' : '对话'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {block.direction === 'vertical' ? '竖排' : '横排'}
              </span>
              {block.rotation ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  {block.rotation}°
                </span>
              ) : null}
            </div>
            {block.original && (
              <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{block.original}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">译文</p>
            <textarea
              value={block.translation}
              rows={1}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
              onChange={(e) => {
                onUpdateTranslation(i, e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
              onClick={(e) => e.stopPropagation()}
              placeholder="输入译文"
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none overflow-hidden"
            />

            {/* Color controls (non-polygon bubble/caption, shown when selected in embed mode) */}
            {showColor && onUpdateBlock && (
              <div className="mt-3 space-y-2 border-t border-blue-200 dark:border-blue-700 pt-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">背景色调整</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeselect?.() }}
                    className="text-[11px] px-1.5 py-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    收起
                  </button>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">色调</span>
                  <input
                    type="range" min={-180} max={180} step={1}
                    value={block.colorHue ?? 0}
                    onChange={(e) => onUpdateBlock(i, { colorHue: Number(e.target.value) })}
                    className="flex-1 h-1.5 accent-blue-500"
                  />
                  <span className="text-[11px] text-gray-400 w-8 text-right">{block.colorHue ?? 0}°</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">饱和</span>
                  <input
                    type="range" min={0} max={2} step={0.05}
                    value={block.colorSaturation ?? 1}
                    onChange={(e) => onUpdateBlock(i, { colorSaturation: Number(e.target.value) })}
                    className="flex-1 h-1.5 accent-blue-500"
                  />
                  <span className="text-[11px] text-gray-400 w-8 text-right">{((block.colorSaturation ?? 1) * 100).toFixed(0)}%</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10 shrink-0">透明</span>
                  <input
                    type="range" min={0} max={1} step={0.02}
                    value={block.colorOpacity ?? 1}
                    onChange={(e) => onUpdateBlock(i, { colorOpacity: Number(e.target.value) })}
                    className="flex-1 h-1.5 accent-blue-500"
                  />
                  <span className="text-[11px] text-gray-400 w-8 text-right">{((block.colorOpacity ?? 1) * 100).toFixed(0)}%</span>
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
