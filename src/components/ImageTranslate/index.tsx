import { useCallback, useRef, useState } from 'react'
import { useImageStore, FONT_OPTIONS } from '../../stores/imageStore'
import { aiImageTranslateFast, aiImageTranslateFull } from '../../services/ai'
import { TranslationList } from './TranslationList'
import { ImageEditor, type ImageEditorHandle } from './ImageEditor'
import { ImageViewer, type ImageViewerHandle } from './ImageViewer'
import { BlockOverlay } from './BlockOverlay'
import { ExportButton } from './ExportButton'

const LANG_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: '日语', label: '日语' },
  { value: '英语', label: '英语' },
  { value: '韩语', label: '韩语' },
  { value: '法语', label: '法语' },
]

const TARGET_OPTIONS = [
  { value: '中文', label: '中文' },
  { value: '英语', label: '英语' },
  { value: '日语', label: '日语' },
]

export function ImageTranslateView() {
  const {
    imageUrl, imageFile, imageBase64: storedBase64, sourceLang, targetLang, fontFamily,
    blocks, bboxReady, status, error,
    setImage, setImageBase64, clearImage, setSourceLang, setTargetLang, setFontFamily,
    setBlocks, updateBlock, deleteBlock, addBlock, setStatus,
  } = useImageStore()

  const [embedMode, setEmbedMode] = useState(false)
  const [embedLoading, setEmbedLoading] = useState(false)
  const [imageCollapsed, setImageCollapsed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [, setViewerScale] = useState(1)

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ImageEditorHandle | null>(null)
  const viewerRef = useRef<ImageViewerHandle | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /** Convert imageFile to base64, cache in store */
  async function getBase64(): Promise<string> {
    if (storedBase64) return storedBase64
    if (!imageFile) throw new Error('No image file')
    const buffer = await imageFile.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = `data:${imageFile.type};base64,${btoa(binary)}`
    setImageBase64(b64)
    return b64
  }

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setImage(file)
    setSelectedIndex(null)
    setEmbedMode(false)
  }, [setImage])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  /** Stage 1: fast OCR+translate, no bbox */
  const handleTranslate = useCallback(async () => {
    if (!imageFile) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setSelectedIndex(null)
    setEmbedMode(false)
    try {
      const base64 = await getBase64()
      const result = await aiImageTranslateFast(base64, sourceLang, targetLang, controller.signal)
      setBlocks(result, false)
      setStatus('done')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setStatus('error', (err as Error).message)
    }
  }, [imageFile, sourceLang, targetLang, setBlocks, setStatus])

  /** Stage 2: full bbox, triggered on entering embed mode */
  const handleEnterEmbed = useCallback(async () => {
    if (bboxReady) { setEmbedMode(true); return }
    const base64 = storedBase64
    if (!base64) return
    setEmbedLoading(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await aiImageTranslateFull(base64, sourceLang, targetLang, controller.signal)
      // Merge: keep user-edited translations, replace bbox from new result
      const merged = result.map((newBlock, i) => ({
        ...newBlock,
        translation: blocks[i]?.translation ?? newBlock.translation,
        colorHue: blocks[i]?.colorHue,
        colorSaturation: blocks[i]?.colorSaturation,
        colorOpacity: blocks[i]?.colorOpacity,
      }))
      setBlocks(merged, true)
      setEmbedMode(true)
      viewerRef.current?.resetTransform()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      // On failure, enter embed mode anyway with existing data
      setEmbedMode(true)
    } finally {
      setEmbedLoading(false)
    }
  }, [bboxReady, storedBase64, sourceLang, targetLang, blocks, setBlocks])

  function handleSelect(index: number | null) {
    setSelectedIndex(index)
    if (index !== null && listRef.current) {
      const el = listRef.current.querySelector(`#block-item-${index}`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Language + font selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="源语言"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-gray-400">→</span>
        <select
          aria-label="目标语言"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          aria-label="字体"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Upload area */}
      {!imageUrl ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-12 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
        >
          <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <p className="text-sm text-gray-400 dark:text-gray-500">点击或拖拽上传图片</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="上传图片"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Translate button */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={status === 'loading'}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'loading' ? '翻译中...' : status === 'done' ? '重新翻译' : '开始翻译'}
            </button>
            <button
              type="button"
              onClick={() => { clearImage(); setSelectedIndex(null) }}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              换图
            </button>
          </div>

          {/* Error */}
          {status === 'error' && error && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
              <button onClick={handleTranslate} className="ml-2 underline">重试</button>
            </div>
          )}

          {/* Loading skeleton */}
          {status === 'loading' && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {/* Results: always show viewer after translation done */}
          {(status === 'done' || status === 'idle') && (
            <>
              {/* Mode toggle (only when there are blocks) */}
              {blocks.length > 0 && (
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setEmbedMode(false)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      !embedMode
                        ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    翻译列表
                  </button>
                  <button
                    type="button"
                    onClick={handleEnterEmbed}
                    disabled={embedLoading}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-60 ${
                      embedMode
                        ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {embedLoading ? '计算位置…' : '嵌字编辑'}
                  </button>
                </div>
              )}

              {embedMode ? (
                /* ── 嵌字编辑模式 ── */
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    拖拽色框调整位置 · 拖拽控制点缩放 · 空白处画框新增 · 选中后点 × 删除
                  </p>
                  <ImageViewer ref={viewerRef} onScaleChange={setViewerScale}>
                    <ImageEditor ref={editorRef} imageUrl={imageUrl!} blocks={blocks} fontFamily={fontFamily} />
                    <BlockOverlay
                      blocks={blocks}
                      selectedIndex={selectedIndex}
                      onSelect={handleSelect}
                      onUpdateBlock={(i, partial) => updateBlock(i, partial)}
                      onDeleteBlock={deleteBlock}
                      onAddBlock={addBlock}
                    />
                  </ImageViewer>
                  <ExportButton editorRef={editorRef} />
                  <div ref={listRef}>
                    <TranslationList
                      blocks={blocks}
                      onUpdateTranslation={(i, t) => updateBlock(i, { translation: t })}
                      onUpdateBlock={updateBlock}
                      selectedIndex={selectedIndex ?? undefined}
                      onSelect={handleSelect}
                    />
                  </div>
                </div>
              ) : (
                /* ── 翻译列表模式 ── */
                <div>
                  {/* Sticky collapsible image — breaks out of p-4 with -mx-4 */}
                  <div className="sticky top-0 z-10 -mx-4 bg-white dark:bg-gray-900 shadow-sm">
                    {imageCollapsed ? (
                      <button
                        type="button"
                        onClick={() => setImageCollapsed(false)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors border-b border-gray-100 dark:border-gray-800"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        展开原图
                      </button>
                    ) : (
                      <div className="relative">
                        <img
                          src={imageUrl!}
                          alt="原图"
                          className="w-full object-contain max-h-[45vh]"
                        />
                        <button
                          type="button"
                          onClick={() => setImageCollapsed(true)}
                          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 text-white text-[11px] hover:bg-black/70 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                          收起
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Translation list — scrolls below the sticky image */}
                  <div className="pt-3">
                    {blocks.length > 0 ? (
                      <div ref={listRef}>
                        <TranslationList
                          blocks={blocks}
                          onUpdateTranslation={(i, t) => updateBlock(i, { translation: t })}
                          onUpdateBlock={updateBlock}
                          selectedIndex={selectedIndex ?? undefined}
                          onSelect={handleSelect}
                        />
                      </div>
                    ) : status === 'done' ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">未检测到文字</p>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
