import { useState } from 'react'
import type { TextBlock } from '../../types'
import { FONT_OPTIONS } from '../../stores/imageStore'

interface Props {
  block: TextBlock
  onChange: (partial: Partial<TextBlock>) => void
}

type TabType = 'typography' | 'color' | 'cleanup'

const PRESET_COLORS = [
  '#000000', // 经典黑
  '#ffffff', // 纯净白
  '#ff3b30', // 热情红
  '#ffcc00', // 活泼黄
  '#34c759', // 生机绿
  '#007aff', // 科技蓝
  '#af52de', // 梦幻紫
]

export function BlockStylePanel({ block, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('typography')

  // Read styles with default fallbacks
  const isHorizontal = block.direction !== 'vertical'
  const textAlign = block.textAlign || 'center'
  const isBold = block.fontWeight === 'bold'
  const isItalic = block.fontStyle === 'italic'
  const fontSizeMode = block.fontSizeMode || 'auto'
  const fontSizeCustom = block.fontSizeCustom ?? 24
  const fontSizeMultiplier = block.fontSizeMultiplier ?? 1
  const fontFamilyCustom = block.fontFamilyCustom || ''
  
  const strokeEnabled = block.strokeEnabled ?? (block.type === 'sfx') // SFX defaults to stroke enabled
  const strokeColor = block.strokeColor || '#ffffff'
  const strokeWidth = block.strokeWidth ?? 3
  const textColor = block.textColor || ''

  const fillColorMode = block.fillColorMode || 'auto'
  const fillColorCustom = block.fillColorCustom || '#ffffff'
  const fillOpacity = block.fillOpacity ?? 1

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/20 dark:border-gray-800/40 bg-white/40 dark:bg-gray-900/30 backdrop-blur-md shadow-lg animate-in slide-in-from-top-2 duration-300">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200/50 dark:border-gray-800/50 bg-gray-100/40 dark:bg-gray-800/30">
        <button
          type="button"
          onClick={() => setActiveTab('typography')}
          className={`flex-1 py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'typography'
              ? 'text-blue-500 bg-white/60 dark:bg-gray-800/60 shadow-sm border-b-2 border-blue-500'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/30 dark:hover:bg-gray-800/20'
          }`}
        >
          🔤 排版与字形
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('color')}
          className={`flex-1 py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'color'
              ? 'text-blue-500 bg-white/60 dark:bg-gray-800/60 shadow-sm border-b-2 border-blue-500'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/30 dark:hover:bg-gray-800/20'
          }`}
        >
          🎨 色彩与描边
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cleanup')}
          className={`flex-1 py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            activeTab === 'cleanup'
              ? 'text-blue-500 bg-white/60 dark:bg-gray-800/60 shadow-sm border-b-2 border-blue-500'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/30 dark:hover:bg-gray-800/20'
          }`}
        >
          🧹 遮罩与擦除
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-3.5 space-y-3.5 text-xs">
        {/* TAB 1: Typography */}
        {activeTab === 'typography' && (
          <div className="space-y-3">
            {/* Row 1: Direction & Align & Bold & Italic */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Direction toggle */}
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-400 dark:text-gray-500">排版方向</span>
                <div className="flex rounded-md bg-gray-100/60 dark:bg-gray-800/60 p-0.5 border border-gray-200/30 dark:border-gray-700/30">
                  <button
                    type="button"
                    onClick={() => onChange({ direction: 'horizontal' })}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      isHorizontal
                        ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    横排
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ direction: 'vertical' })}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      !isHorizontal
                        ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    竖排
                  </button>
                </div>
              </div>

              {/* Alignments (horizontal only) */}
              {isHorizontal && (
                <div className="space-y-1">
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500">对齐方式</span>
                  <div className="flex rounded-md bg-gray-100/60 dark:bg-gray-800/60 p-0.5 border border-gray-200/30 dark:border-gray-700/30">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => onChange({ textAlign: align })}
                        className={`px-2 py-1 rounded transition-colors ${
                          textAlign === align
                            ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm font-bold'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                        title={align === 'left' ? '左对齐' : align === 'center' ? '居中对齐' : '右对齐'}
                      >
                        {align === 'left' ? '⬅️' : align === 'center' ? '↔️' : '➡️'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bold & Italic toggles */}
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-400 dark:text-gray-500">字形样式</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onChange({ fontWeight: isBold ? 'normal' : 'bold' })}
                    className={`w-7 h-7 flex items-center justify-center rounded border transition-colors text-sm ${
                      isBold
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-500 font-bold'
                        : 'border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ fontStyle: isItalic ? 'normal' : 'italic' })}
                    className={`w-7 h-7 flex items-center justify-center rounded border transition-colors italic text-sm ${
                      isItalic
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-500 font-bold'
                        : 'border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    I
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Font Family Dropdown */}
            <div className="space-y-1">
              <label htmlFor={`font-family-${(block.original || block.translation).substring(0, 8)}`} className="block text-[10px] text-gray-400 dark:text-gray-500">
                字体库 (覆盖全局)
              </label>
              <select
                id={`font-family-${(block.original || block.translation).substring(0, 8)}`}
                value={fontFamilyCustom}
                onChange={(e) => onChange({ fontFamilyCustom: e.target.value || undefined })}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300"
              >
                <option value="">跟随全局默认字体</option>
                {FONT_OPTIONS.map((fo) => (
                  <option key={fo.value} value={fo.value}>
                    {fo.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Row 3: Font Size Mode & Slider */}
            <div className="space-y-2 pt-1.5 border-t border-gray-200/30 dark:border-gray-800/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">字号大小模式</span>
                <div className="flex rounded bg-gray-100/60 dark:bg-gray-800/60 p-0.5 border border-gray-200/30 dark:border-gray-700/30">
                  <button
                    type="button"
                    onClick={() => onChange({ fontSizeMode: 'auto' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      fontSizeMode === 'auto'
                        ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    自动缩放
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ fontSizeMode: 'custom' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      fontSizeMode === 'custom'
                        ? 'bg-white dark:bg-gray-700 text-blue-500 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    固定大小
                  </button>
                </div>
              </div>

              {fontSizeMode === 'auto' ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>缩放比: {(fontSizeMultiplier).toFixed(2)}x</span>
                    <button type="button" onClick={() => onChange({ fontSizeMultiplier: 1 })} className="text-blue-500 hover:underline">重置</button>
                  </div>
                  <input
                    type="range"
                    aria-label="字号缩放比例"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={fontSizeMultiplier}
                    onChange={(e) => onChange({ fontSizeMultiplier: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>字号: {fontSizeCustom}px</span>
                    <button type="button" onClick={() => onChange({ fontSizeCustom: 24 })} className="text-blue-500 hover:underline">重置</button>
                  </div>
                  <input
                    type="range"
                    aria-label="自定义字号"
                    min="8"
                    max="100"
                    step="1"
                    value={fontSizeCustom}
                    onChange={(e) => onChange({ fontSizeCustom: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Color and Stroke */}
        {activeTab === 'color' && (
          <div className="space-y-3.5">
            {/* Text Color Picker & Presets */}
            <div className="space-y-1.5">
              <span className="block text-[10px] text-gray-400 dark:text-gray-500">文字颜色</span>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Auto Color Toggle */}
                <button
                  type="button"
                  onClick={() => onChange({ textColor: undefined })}
                  className={`px-2 py-1 rounded border text-[10px] font-semibold transition-colors ${
                    !textColor
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-500'
                      : 'border-gray-200/50 dark:border-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  🌓 自动反色
                </button>

                {/* Presets */}
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onChange({ textColor: color })}
                    style={{ backgroundColor: color }}
                    className={`w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-110 active:scale-95 ${
                      textColor === color ? 'ring-2 ring-blue-500 scale-105' : ''
                    }`}
                    title={color}
                  />
                ))}

                {/* Custom Color input */}
                <div className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-300 dark:border-gray-600 hover:scale-105">
                  <input
                    type="color"
                    aria-label="自定义文本颜色"
                    value={textColor && textColor.startsWith('#') ? textColor : '#ff0000'}
                    onChange={(e) => onChange({ textColor: e.target.value })}
                    className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Stroke Customizer */}
            <div className="pt-2.5 border-t border-gray-200/30 dark:border-gray-800/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">启用描边/粗外线</span>
                <button
                  type="button"
                  onClick={() => onChange({ strokeEnabled: !strokeEnabled })}
                  className={`w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 ${
                    strokeEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                  aria-label="启用文字描边"
                >
                  <span className={`w-3 h-3 rounded-full bg-white transition-transform ${strokeEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {strokeEnabled && (
                <div className="space-y-2.5 animate-in slide-in-from-top-1 duration-200">
                  {/* Stroke Color */}
                  <div className="space-y-1">
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">描边颜色</span>
                    <div className="flex items-center gap-1.5">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => onChange({ strokeColor: color })}
                          style={{ backgroundColor: color }}
                          className={`w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-110 active:scale-95 ${
                            strokeColor === color ? 'ring-2 ring-blue-500 scale-105' : ''
                          }`}
                        />
                      ))}
                      <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-300 dark:border-gray-600 hover:scale-105">
                        <input
                          type="color"
                          aria-label="自定义描边颜色"
                          value={strokeColor.startsWith('#') ? strokeColor : '#ffffff'}
                          onChange={(e) => onChange({ strokeColor: e.target.value })}
                          className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stroke Width Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>宽度: {strokeWidth}px</span>
                      <button type="button" onClick={() => onChange({ strokeWidth: 3 })} className="text-blue-500 hover:underline">恢复默认</button>
                    </div>
                    <input
                      type="range"
                      aria-label="描边粗细"
                      min="1"
                      max="12"
                      step="0.5"
                      value={strokeWidth}
                      onChange={(e) => onChange({ strokeWidth: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Cleanup options */}
        {activeTab === 'cleanup' && (
          <div className="space-y-3.5">
            {/* Cleanup Mode Selection */}
            <div className="space-y-1.5">
              <span className="block text-[10px] text-gray-400 dark:text-gray-500">背景擦除模式</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['auto', 'custom', 'transparent'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChange({ fillColorMode: mode })}
                    className={`py-1.5 px-2 rounded-lg border text-center transition-all ${
                      fillColorMode === mode
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-500 font-bold'
                        : 'border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    {mode === 'auto' ? '🔍 智能采样' : mode === 'custom' ? '🎨 自定义色' : '🫥 透明/不擦'}
                  </button>
                ))}
              </div>
            </div>

            {/* Mask Shape Selection */}
            <div className="space-y-1.5 pt-2.5 border-t border-gray-200/30 dark:border-gray-800/30">
              <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-semibold">手工选遮罩形状</span>
              <div className="grid grid-cols-5 gap-1">
                {(['ellipse', 'rect', 'rounded-rect', 'circle', 'capsule', 'diamond', 'burst', 'magic-wand', 'polygon', 'none'] as const).map((shape) => {
                  const label = shape === 'ellipse' ? '椭圆' :
                                shape === 'rect' ? '矩形' :
                                shape === 'rounded-rect' ? '圆角' :
                                shape === 'circle' ? '正圆' :
                                shape === 'capsule' ? '胶囊' :
                                shape === 'diamond' ? '菱形' :
                                shape === 'burst' ? '爆炸' :
                                shape === 'magic-wand' ? '魔棒' :
                                shape === 'polygon' ? '自定义' : '无';
                  
                  const isCaption = block.type === 'caption';
                  const isSFX = block.type === 'sfx';
                  const activeShape = block.maskShape || (
                    (block.polygon && block.polygon.length >= 3) ? 'polygon' :
                    isCaption ? 'rounded-rect' :
                    isSFX ? 'none' : 'ellipse'
                  );
                  
                  return (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => onChange({ maskShape: shape })}
                      className={`py-1 text-[10px] rounded-md border text-center transition-all ${
                        activeShape === shape
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-500 font-bold shadow-sm'
                          : 'border-gray-200/50 dark:border-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Color picker (if Custom) */}
            {fillColorMode === 'custom' && (
              <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                <span className="block text-[10px] text-gray-400 dark:text-gray-500">背景填充颜色</span>
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onChange({ fillColorCustom: color })}
                      style={{ backgroundColor: color }}
                      className={`w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-110 active:scale-95 ${
                        fillColorCustom === color ? 'ring-2 ring-blue-500 scale-105' : ''
                      }`}
                    />
                  ))}
                  <div className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-300 dark:border-gray-600 hover:scale-105">
                    <input
                      type="color"
                      aria-label="自定义背景填充色"
                      value={fillColorCustom.startsWith('#') ? fillColorCustom : '#ffffff'}
                      onChange={(e) => onChange({ fillColorCustom: e.target.value })}
                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Opacity Slider */}
            {fillColorMode !== 'transparent' && (
              <div className="space-y-1 pt-2.5 border-t border-gray-200/30 dark:border-gray-800/30">
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>擦除背景不透明度: {Math.round(fillOpacity * 100)}%</span>
                  <button type="button" onClick={() => onChange({ fillOpacity: 1 })} className="text-blue-500 hover:underline">100%</button>
                </div>
                <input
                  type="range"
                  aria-label="填充不透明度"
                  min="0"
                  max="1"
                  step="0.05"
                  value={fillOpacity}
                  onChange={(e) => onChange({ fillOpacity: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
