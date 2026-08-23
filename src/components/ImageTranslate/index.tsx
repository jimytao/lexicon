import { useCallback, useRef, useState } from 'react'
import { useImageStore } from '../../stores/imageStore'
import { aiImageTranslateFast } from '../../services/ai'
import { TranslationList } from './TranslationList'
import { ImageViewer, type ImageViewerHandle } from './ImageViewer'
import { CameraModal } from './CameraModal'
import { captureNativePhoto } from '../../services/camera'
import { isCapacitor } from '../../services/platform'
import { useSettingsStore } from '../../stores/settingsStore'
import { useT } from '../../i18n'

const LANG_OPTIONS = [
  { value: 'auto', labelKey: 'image.lang.auto' },
  { value: '日语', labelKey: 'image.lang.ja' },
  { value: '英语', labelKey: 'image.lang.en' },
  { value: '韩语', labelKey: 'image.lang.ko' },
  { value: '法语', labelKey: 'image.lang.fr' },
]

const TARGET_OPTIONS = [
  { value: '中文', labelKey: 'image.lang.zh' },
  { value: '英语', labelKey: 'image.lang.en' },
  { value: '日语', labelKey: 'image.lang.ja' },
]

export function ImageTranslateView() {
  const t = useT()
  const savePhotoToGallery = useSettingsStore((s) => s.savePhotoToGallery)
  const {
    images, currentIndex,
    sourceLang, targetLang,
    addImages, removeCurrentImage, clearAll, setCurrentIndex,
    updateBlock, setImageBase64At, setBlocksAt, setStatusAt,
    setSourceLang, setTargetLang,
  } = useImageStore()

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)

  const current = images[currentIndex] ?? null
  const imageUrl = current?.imageUrl ?? null
  const blocks = current?.blocks ?? []
  const status = current?.status ?? 'idle'
  const error = current?.error ?? null

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addFileInputRef = useRef<HTMLInputElement>(null)
  const viewerRef = useRef<ImageViewerHandle | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const hasImages = images.length > 0
  const multiImage = images.length > 1

  const handleFiles = useCallback((files: FileList | File[]) => {
    addImages(Array.from(files))
  }, [addImages])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleSwitchImage = useCallback((index: number) => {
    if (index < 0 || index >= images.length) return
    setCurrentIndex(index)
  }, [images.length, setCurrentIndex])

  const handleTakePhoto = useCallback(async () => {
    if (isCapacitor()) {
      try {
        const file = await captureNativePhoto({ saveToGallery: savePhotoToGallery })
        if (file) addImages([file])
      } catch (err: any) {
        if (err?.message === 'PERMISSION_DENIED') {
          alert(t('image.cameraPermissionDenied'))
        } else {
          console.warn('Native camera capture error:', err)
        }
      }
    } else {
      setIsCameraModalOpen(true)
    }
  }, [addImages, savePhotoToGallery, t])

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

  const handleTranslate = useCallback(async () => {
    if (images.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    images.forEach((_, i) => setStatusAt(i, 'loading'))
    await Promise.all(images.map(async (_, i) => {
      try {
        const base64 = await getBase64At(i)
        const result = await aiImageTranslateFast(base64, sourceLang, targetLang, controller.signal)
        setBlocksAt(i, result)
        setStatusAt(i, 'done')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setStatusAt(i, 'error', (err as Error).message)
      }
    }))
  }, [images, sourceLang, targetLang, setBlocksAt, setStatusAt])

  return (
    <div className="px-4 sm:px-6 lg:px-8 xl:px-12 pt-safe pb-nav-safe space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Language selectors */}
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <select
          aria-label={t('settings.appLanguage')}
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
        </select>
        <span className="text-gray-400">→</span>
        <select
          aria-label={t('settings.appLanguage')}
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
        </select>
      </div>

      {/* Upload area */}
      {!hasImages ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-10 px-4 transition-colors"
        >
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-4">
            {/* Take Photo Button */}
            <button
              type="button"
              onClick={handleTakePhoto}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-95 text-gray-800 dark:text-gray-100 font-semibold text-xs sm:text-sm shadow-sm transition-all w-full whitespace-nowrap"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <span>{t('image.takePhoto')}</span>
            </button>

            {/* Choose Local File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-95 text-gray-800 dark:text-gray-100 font-semibold text-xs sm:text-sm shadow-sm transition-all w-full whitespace-nowrap"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              <span>{t('image.chooseLocalImage')}</span>
            </button>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">{t('image.uploadHint')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            aria-label={t('image.uploadHint')}
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
                ? t('image.translating')
                : images.some(img => img.status === 'done')
                  ? t('image.retranslateAll')
                  : t('image.translateAll')}
            </button>

            {/* Camera photo button in action bar */}
            <button
              type="button"
              onClick={handleTakePhoto}
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
              title={t('image.takePhoto')}
              aria-label={t('image.takePhoto')}
            >
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </button>

            {/* Add local file button in action bar */}
            <button
              type="button"
              onClick={() => addFileInputRef.current?.click()}
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
              title={t('image.addMore')}
              aria-label={t('image.addMore')}
            >
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <input
              ref={addFileInputRef}
              type="file"
              accept="image/*"
              multiple
              aria-label={t('image.addMore')}
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
            />
            <button
              type="button"
              onClick={removeCurrentImage}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >{t('image.remove')}</button>
            {multiImage && (
              <button
                type="button"
                onClick={clearAll}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-red-200 dark:border-red-800 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >{t('image.clearAll')}</button>
            )}
          </div>

          {/* Multi-image thumbnail strip */}
          {multiImage && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handleSwitchImage(i)}
                  className={`relative shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
                    i === currentIndex ? 'border-blue-500' : 'border-transparent hover:border-gray-400'
                  }`}
                >
                  <img src={img.imageUrl} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                  {img.status === 'done' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-tl-sm" />}
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
              <button type="button" onClick={handleTranslate} className="ml-2 underline">{t('image.retry')}</button>
            </div>
          )}

          {/* Sticky image viewer */}
          {imageUrl && (
            <div className="sticky top-safe z-10 -mx-4 bg-white dark:bg-gray-900 shadow-sm">
              <div className="relative">
                <ImageViewer ref={viewerRef} onScaleChange={() => {}} compact>
                  <img src={imageUrl} alt="Original" className="w-full object-contain max-h-[50vh]" />
                </ImageViewer>
                {multiImage && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSwitchImage(currentIndex - 1)}
                      disabled={currentIndex === 0}
                      className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                <button
                  type="button"
                  onClick={() => viewerRef.current?.resetTransform()}
                  className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
                  title={t('image.resetView')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {status === 'loading' && (
            <div className="space-y-3 animate-pulse pt-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {/* Translation results */}
          {(status === 'done' || status === 'idle') && (
            <div className="pt-3">
              {blocks.length > 0 ? (
                <div ref={listRef}>
                  <TranslationList
                    blocks={blocks}
                    onUpdateTranslation={(i, t) => updateBlock(i, { translation: t })}
                  />
                </div>
              ) : status === 'done' ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('image.noText')}</p>
              ) : null}
            </div>
          )}

        </div>
      )}

      {/* Web/Desktop Camera Capture Modal */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(file) => addImages([file])}
      />
    </div>
  )
}
