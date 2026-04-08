import { useCallback, useRef, useState } from 'react'
import { useImageStore, FONT_OPTIONS } from '../../stores/imageStore'
import { aiImageTranslate } from '../../services/ai'
import { TranslationList } from './TranslationList'
import { ImageEditor, type ImageEditorHandle } from './ImageEditor'
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
    imageUrl, imageFile, sourceLang, targetLang, fontFamily,
    blocks, status, error,
    setImage, clearImage, setSourceLang, setTargetLang, setFontFamily,
    setBlocks, updateBlock, setStatus,
  } = useImageStore()

  const [embedMode, setEmbedMode] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ImageEditorHandle | null>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setImage(file)
  }, [setImage])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleTranslate = useCallback(async () => {
    if (!imageFile) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('loading')

    try {
      // Convert to base64
      const buffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = `data:${imageFile.type};base64,${btoa(binary)}`

      const result = await aiImageTranslate(base64, sourceLang, targetLang, controller.signal)
      setBlocks(result)
      setStatus('done')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setStatus('error', (err as Error).message)
    }
  }, [imageFile, sourceLang, targetLang, setBlocks, setStatus])

  return (
    <div className="p-4 space-y-4">
      {/* Language + font selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-gray-400">→</span>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
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
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Image preview */}
          <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img src={imageUrl} alt="上传的图片" className="w-full object-contain max-h-[400px]" />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
              aria-label="移除图片"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Translate button */}
          <button
            onClick={handleTranslate}
            disabled={status === 'loading'}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'loading' ? '翻译中...' : '开始翻译'}
          </button>

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

          {/* Results */}
          {status === 'done' && blocks.length > 0 && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
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
                  onClick={() => setEmbedMode(true)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    embedMode
                      ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  嵌字预览
                </button>
              </div>

              {embedMode ? (
                <div className="space-y-3">
                  <ImageEditor ref={editorRef} imageUrl={imageUrl!} blocks={blocks} fontFamily={fontFamily} />
                  <ExportButton editorRef={editorRef} />
                  <TranslationList blocks={blocks} onUpdateTranslation={updateBlock} />
                </div>
              ) : (
                <TranslationList blocks={blocks} onUpdateTranslation={updateBlock} />
              )}
            </>
          )}

          {status === 'done' && blocks.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">未检测到文字</p>
          )}
        </div>
      )}
    </div>
  )
}
