import { useCallback, useEffect, useRef, useState } from 'react'
import { useImageStore, FONT_OPTIONS } from '../../stores/imageStore'
import { aiImageTranslateFast, aiImageTranslateFull } from '../../services/ai'
import { TranslationList } from './TranslationList'
import { ImageEditor, type ImageEditorHandle } from './ImageEditor'
import { ImageViewer, type ImageViewerHandle } from './ImageViewer'
import { BlockOverlay } from './BlockOverlay'
import { ExportButton } from './ExportButton'

import type { TextBlock } from '../../types'

/** Transfer Phase 1 user-edited translations into Phase 2 blocks (which have accurate bboxes).
 *  Matches by normalised original-text character overlap; each Phase 1 block is used at most once. */
function mergePhase1Translations(p2Blocks: TextBlock[], p1Blocks: TextBlock[]): TextBlock[] {
  function similarity(a: string, b: string): number {
    if (!a || !b) return 0
    const na = a.toLowerCase().replace(/\s/g, '')
    const nb = b.toLowerCase().replace(/\s/g, '')
    if (na === nb) return 1
    const freq = new Map<string, number>()
    for (const c of na) freq.set(c, (freq.get(c) ?? 0) + 1)
    let match = 0
    const bFreq = new Map<string, number>()
    for (const c of nb) bFreq.set(c, (bFreq.get(c) ?? 0) + 1)
    for (const [c, cnt] of freq) match += Math.min(cnt, bFreq.get(c) ?? 0)
    return match / Math.max(na.length, nb.length)
  }

  const used = new Set<number>()
  return p2Blocks.map((p2) => {
    let bestIdx = -1
    let bestScore = 0.4 // minimum threshold
    for (let i = 0; i < p1Blocks.length; i++) {
      if (used.has(i)) continue
      const score = similarity(p2.original ?? '', p1Blocks[i].original ?? '')
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }
    if (bestIdx >= 0 && p1Blocks[bestIdx].translation) {
      used.add(bestIdx)
      return { ...p2, translation: p1Blocks[bestIdx].translation }
    }
    return p2
  })
}

function findScrollContainer(el: Element | null): Element | null {
  let cur = el
  while (cur) {
    const ov = getComputedStyle(cur).overflowY
    if (ov === 'auto' || ov === 'scroll') return cur
    cur = cur.parentElement
  }
  return null
}

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
    images, currentIndex,
    sourceLang, targetLang, fontFamily,
    addImages, removeCurrentImage, clearAll, setCurrentIndex,
    setBlocks, updateBlock, deleteBlock, addBlock,
    setImageBase64At, setBlocksAt, setStatusAt,
    setSourceLang, setTargetLang, setFontFamily,
  } = useImageStore()

  const current = images[currentIndex] ?? null
  const imageUrl = current?.imageUrl ?? null
  const storedBase64 = current?.imageBase64 ?? null
  const blocks = current?.blocks ?? []
  const bboxReady = current?.bboxReady ?? false
  const status = current?.status ?? 'idle'
  const error = current?.error ?? null

  const [embedMode, setEmbedMode] = useState(false)
  const [embedLoading, setEmbedLoading] = useState(false)
  const [imageCollapsed, setImageCollapsed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ImageEditorHandle | null>(null)
  const viewerRef = useRef<ImageViewerHandle | null>(null)
  const listViewerRef = useRef<ImageViewerHandle | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)

  const handleFiles = useCallback((files: FileList | File[]) => {
    addImages(Array.from(files))
    setSelectedIndex(null)
    setEmbedMode(false)
  }, [addImages])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleSwitchImage = useCallback((index: number) => {
    setCurrentIndex(index)
    setSelectedIndex(null)
    setEmbedMode(false)
    setImageCollapsed(false)
  }, [setCurrentIndex])

  // After image switch, scroll so the sticky image is just pinned at top and list starts from item 1.
  // Two-step: reset to 0 first so getBoundingClientRect is accurate, then jump to stickyRef's natural offset.
  const hasMountedRef = useRef(false)
  const scrollContainerRef = useRef<Element | null>(null)
  const scrollStickyToPinned = useCallback((delay = 0) => {
    const run = () => {
      if (!stickyRef.current) return
      const sc = scrollContainerRef.current ?? findScrollContainer(stickyRef.current)
      if (!sc) return
      scrollContainerRef.current = sc
      sc.scrollTo({ top: 0, behavior: 'instant' })
      requestAnimationFrame(() => {
        if (!stickyRef.current) return
        const target = stickyRef.current.getBoundingClientRect().top - sc.getBoundingClientRect().top
        sc.scrollTo({ top: Math.max(0, target), behavior: 'instant' })
      })
    }
    if (delay > 0) window.setTimeout(run, delay)
    else run()
  }, [])

  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return }
    scrollStickyToPinned()
  }, [currentIndex, scrollStickyToPinned])

  /** Convert any image file to base64, cache in store at given index */
  async function getBase64At(imgIndex: number): Promise<string> {
    const entry = images[imgIndex]
    if (!entry) throw new Error('No image entry')
    if (entry.imageBase64) return entry.imageBase64
    const buffer = await entry.file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = `data:${entry.file.type};base64,${btoa(binary)}`
    setImageBase64At(imgIndex, b64)
    return b64
  }

  /** Stage 1: batch translate all images in parallel */
  const handleTranslate = useCallback(async () => {
    if (images.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSelectedIndex(null)
    setEmbedMode(false)

    // Mark all as loading
    images.forEach((_, i) => setStatusAt(i, 'loading'))

    // Translate all in parallel
    await Promise.all(images.map(async (_, i) => {
      try {
        const base64 = await getBase64At(i)
        const result = await aiImageTranslateFast(base64, sourceLang, targetLang, controller.signal)
        setBlocksAt(i, result, false)
        setStatusAt(i, 'done')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setStatusAt(i, 'error', (err as Error).message)
      }
    }))
  }, [images, sourceLang, targetLang, setBlocksAt, setStatusAt])

  const [embedError, setEmbedError] = useState<string | null>(null)

  /** Stage 2: AI full-vision bbox detection, merged with Phase 1 user-edited translations */
  const handleEnterEmbed = useCallback(async () => {
    if (bboxReady) {
      setEmbedMode(true)
      scrollStickyToPinned()
      return
    }
    const base64 = storedBase64
    if (!base64) return
    setEmbedLoading(true)
    setEmbedError(null)
    try {
      // Phase 2: AI detects bboxes/polygons visually (more accurate for manga bubbles than OCR)
      const p2Blocks = await aiImageTranslateFull(base64, sourceLang, targetLang)
      // Merge Phase 1 user-edited translations into Phase 2 blocks (by original text similarity)
      const merged = mergePhase1Translations(p2Blocks, blocks)
      setBlocks(merged, true)
      setEmbedMode(true)
      viewerRef.current?.resetTransform()
      scrollStickyToPinned(100)
    } catch (err) {
      setEmbedError((err as Error).message || 'AI 定位失败，请重试')
    } finally {
      setEmbedLoading(false)
    }
  }, [bboxReady, storedBase64, sourceLang, targetLang, blocks, setBlocks, scrollStickyToPinned])

  const handleSelect = useCallback((index: number | null) => {
    setSelectedIndex(index)
    if (index === null || !listRef.current) return
    const elId = `block-item-${index}`
    const el = listRef.current.querySelector(`#${elId}`)
    if (!el) return
    const sc = scrollContainerRef.current ?? findScrollContainer(el.parentElement)
    if (!sc) return
    scrollContainerRef.current = sc
    // Show the full photo first, then position item just below its bottom edge
    sc.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => {
      const scRect = sc.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const elTopRelative = sc.scrollTop + elRect.top - scRect.top
      const stickyEl = stickyRef.current
      const photoBottom = stickyEl
        ? stickyEl.getBoundingClientRect().bottom - scRect.top
        : 80  // fallback: approximate header height
      const target = elTopRelative - photoBottom
      sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    })
  }, [])

  const [drawPolygonForIndex, setDrawPolygonForIndex] = useState<number | null>(null)
  const handleDrawL1 = useCallback((index: number) => { setDrawPolygonForIndex(index) }, [])

  const hasImages = images.length > 0
  const multiImage = images.length > 1

  return (
    <div className="px-4 pt-safe pb-nav-safe space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Language + font selectors */}
      <div className="flex flex-wrap items-center gap-2 pt-4">
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

      {/* Upload area (no images yet) */}
      {!hasImages ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-12 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
        >
          <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <p className="text-sm text-gray-400 dark:text-gray-500">点击或拖拽上传图片（可多选）</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            aria-label="上传图片"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Action bar */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTranslate}
              disabled={status === 'loading'}
              className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/20"
            >
              {images.some(img => img.status === 'loading')
              ? '翻译中...'
              : images.some(img => img.status === 'done')
                ? `重新翻译全部`
                : '开始翻译全部'}
            </button>
            {/* Add more images */}
            <button
              type="button"
              onClick={() => addFileInputRef.current?.click()}
              className="w-11 h-11 flex items-center justify-center rounded-xl text-sm border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition-colors"
              title="添加更多图片"
              aria-label="添加更多图片"
            >
              +
            </button>
            <input
              ref={addFileInputRef}
              type="file"
              accept="image/*"
              multiple
              aria-label="添加图片"
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
            />
            <button
              type="button"
              onClick={() => { removeCurrentImage(); setSelectedIndex(null); setEmbedMode(false) }}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 transition-colors"
              title="删除此图"
            >
              删除
            </button>
            {multiImage && (
              <button
                type="button"
                onClick={() => { clearAll(); setSelectedIndex(null); setEmbedMode(false) }}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-red-200 dark:border-red-800 text-red-400 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 transition-colors"
                title="清空所有图片"
              >
                清空
              </button>
            )}
          </div>

          {/* Image strip (thumbnail navigation) when multiple images */}
          {multiImage && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handleSwitchImage(i)}
                  className={`relative shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
                    i === currentIndex
                      ? 'border-blue-500'
                      : 'border-transparent hover:border-gray-400'
                  }`}
                >
                  <img src={img.imageUrl} alt={`图片${i + 1}`} className="w-full h-full object-cover" />
                  {img.status === 'done' && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-tl-sm" />
                  )}
                  {img.status === 'loading' && (
                    <span className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              {error}
              <button type="button" onClick={handleTranslate} className="ml-2 underline">重试</button>
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

          {/* Results */}
          {(status === 'done' || status === 'idle') && (
            <>
              {blocks.length > 0 && (
                <>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setEmbedMode(false)}
                      className={`flex-1 px-3 py-2.5 text-xs font-bold rounded-md transition-colors ${
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
                      className={`flex-1 px-3 py-2.5 text-xs font-bold rounded-md transition-colors disabled:opacity-60 ${
                        embedMode
                          ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                    {embedLoading 
                      ? `AI 定位中...`
                      : '嵌字此图'}
                  </button>
                </div>
                {embedError && (
                  <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    AI 定位失败：{embedError}
                    <button type="button" onClick={handleEnterEmbed} className="ml-2 underline">重试</button>
                  </div>
                )}
                </>
              )}

              {embedMode ? (
                /* ── 嵌字编辑模式 ── */
                <div className="space-y-3">
                   <div ref={stickyRef} className="sticky top-safe z-20 -mx-4 px-4 pb-2 bg-white dark:bg-gray-900 shadow-sm">
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
                      <>
                        <div className="flex items-center justify-between pt-2 pb-1">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            拖拽色框调整位置 · 拖拽控制点缩放 · 空白处画框新增 · 选中后点 × 删除
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => viewerRef.current?.resetTransform()}
                              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="重置图片缩放和位置"
                            >
                              重置视图
                            </button>
                            <button
                              type="button"
                              onClick={() => setImageCollapsed(true)}
                              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                              收起
                            </button>
                          </div>
                        </div>
                        <ImageViewer ref={viewerRef} className="max-h-[50vh]">
                          <ImageEditor ref={editorRef} imageUrl={imageUrl!} blocks={blocks} fontFamily={fontFamily} />
                          <BlockOverlay
                            blocks={blocks}
                            selectedIndex={selectedIndex}
                            onSelect={handleSelect}
                            onUpdateBlock={(i, partial) => updateBlock(i, partial)}
                            onDeleteBlock={deleteBlock}
                            onAddBlock={addBlock}
                            drawPolygonForIndex={drawPolygonForIndex}
                            onPolygonDrawn={() => setDrawPolygonForIndex(null)}
                          />
                        </ImageViewer>
                      </>
                    )}
                  </div>
                  <div className="pt-2 pb-1">
                    <ExportButton editorRef={editorRef} />
                  </div>
                  <div ref={listRef}>
                    <TranslationList
                      blocks={blocks}
                      onUpdateTranslation={(i, t) => updateBlock(i, { translation: t })}
                      onUpdateBlock={updateBlock}
                      selectedIndex={selectedIndex ?? undefined}
                      onSelect={handleSelect}
                      onDeselect={() => setSelectedIndex(null)}
                      onDrawL1={handleDrawL1}
                    />
                  </div>
                </div>
              ) : (
                /* ── 翻译列表模式 ── */
                <div>
                  <div ref={stickyRef} className="sticky top-safe z-10 -mx-4 bg-white dark:bg-gray-900 shadow-sm">
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
                        <ImageViewer ref={listViewerRef} onScaleChange={() => {}} compact>
                          <img
                            src={imageUrl!}
                            alt="原图"
                            className="w-full object-contain max-h-[50vh]"
                          />
                        </ImageViewer>
                        {/* Navigation arrows */}
                        {multiImage && (
                          <>
                              <button
                                type="button"
                                onClick={() => handleSwitchImage(currentIndex - 1)}
                                disabled={currentIndex === 0}
                                className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="上一张"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                            <button
                              type="button"
                              onClick={() => handleSwitchImage(currentIndex + 1)}
                              disabled={currentIndex === images.length - 1}
                              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="下一张"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[11px] text-white bg-black/50 px-1.5 py-0.5 rounded-full pointer-events-none">
                              {currentIndex + 1} / {images.length}
                            </span>
                          </>
                        )}
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => listViewerRef.current?.resetTransform()}
                            className="flex items-center justify-center w-6 h-6 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
                            title="重置视图"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setImageCollapsed(true)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 text-white text-[11px] hover:bg-black/70 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                            收起
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3">
                    {blocks.length > 0 ? (
                      <div ref={listRef}>
                        <TranslationList
                          blocks={blocks}
                          onUpdateTranslation={(i, t) => updateBlock(i, { translation: t })}
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
