import { create } from 'zustand'
import type { TextBlock } from '../types'

type TranslateStatus = 'idle' | 'loading' | 'done' | 'error'

export const FONT_OPTIONS = [
  { value: '"ZCOOL KuaiLe", cursive', label: '快乐体（可爱圆润）' },
  { value: '"Ma Shan Zheng", cursive', label: '马善政（毛笔手写）' },
  { value: '"Long Cang", cursive', label: '龙藏（硬笔手写）' },
  { value: '"Noto Sans SC", "Microsoft YaHei", sans-serif', label: '默认黑体' },
] as const

export interface ImageEntry {
  id: string
  file: File
  imageUrl: string
  imageBase64: string | null
  blocks: TextBlock[]
  bboxReady: boolean
  status: TranslateStatus
  error: string | null
}

interface ImageState {
  images: ImageEntry[]
  currentIndex: number
  sourceLang: string
  targetLang: string
  fontFamily: string

  // multi-image management
  addImages: (files: File[]) => void
  removeCurrentImage: () => void
  clearAll: () => void
  setCurrentIndex: (index: number) => void
  nextImage: () => void
  prevImage: () => void

  // per-current-image actions (operate on currentIndex)
  setImageBase64: (b64: string) => void
  setBlocks: (blocks: TextBlock[], bboxReady?: boolean) => void
  updateBlock: (index: number, partial: Partial<TextBlock>) => void
  deleteBlock: (index: number) => void
  addBlock: (block: TextBlock) => void
  setStatus: (status: TranslateStatus, error?: string) => void
  // by explicit image index (for batch operations)
  setImageBase64At: (imageIndex: number, b64: string) => void
  setBlocksAt: (imageIndex: number, blocks: TextBlock[], bboxReady?: boolean) => void
  setStatusAt: (imageIndex: number, status: TranslateStatus, error?: string) => void

  // settings
  setSourceLang: (lang: string) => void
  setTargetLang: (lang: string) => void
  setFontFamily: (font: string) => void
}

function makeEntry(file: File): ImageEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    imageUrl: URL.createObjectURL(file),
    imageBase64: null,
    blocks: [],
    bboxReady: false,
    status: 'idle',
    error: null,
  }
}

function updateCurrent(images: ImageEntry[], index: number, patch: Partial<ImageEntry>): ImageEntry[] {
  return images.map((img, i) => i === index ? { ...img, ...patch } : img)
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  currentIndex: 0,
  sourceLang: 'auto',
  targetLang: '中文',
  fontFamily: FONT_OPTIONS[0].value,

  addImages(files) {
    const newEntries = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(makeEntry)
    if (newEntries.length === 0) return
    const { images } = get()
    const nextIndex = images.length  // new images go to end; navigate to first new one
    set({ images: [...images, ...newEntries], currentIndex: nextIndex })
  },

  removeCurrentImage() {
    const { images, currentIndex } = get()
    images[currentIndex]?.imageUrl && URL.revokeObjectURL(images[currentIndex].imageUrl)
    const next = images.filter((_, i) => i !== currentIndex)
    set({ images: next, currentIndex: Math.min(currentIndex, Math.max(0, next.length - 1)) })
  },

  clearAll() {
    get().images.forEach(img => URL.revokeObjectURL(img.imageUrl))
    set({ images: [], currentIndex: 0 })
  },

  setCurrentIndex(index) {
    const { images } = get()
    if (index >= 0 && index < images.length) set({ currentIndex: index })
  },

  nextImage() {
    const { images, currentIndex } = get()
    if (currentIndex < images.length - 1) set({ currentIndex: currentIndex + 1 })
  },

  prevImage() {
    const { currentIndex } = get()
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1 })
  },

  setImageBase64(b64) {
    const { images, currentIndex } = get()
    set({ images: updateCurrent(images, currentIndex, { imageBase64: b64 }) })
  },

  setBlocks(blocks, bboxReady = false) {
    const { images, currentIndex } = get()
    set({ images: updateCurrent(images, currentIndex, { blocks, bboxReady }) })
  },

  updateBlock(index, partial) {
    const { images, currentIndex } = get()
    const entry = images[currentIndex]
    if (!entry) return
    const blocks = [...entry.blocks]
    if (blocks[index]) {
      blocks[index] = { ...blocks[index], ...partial }
      set({ images: updateCurrent(images, currentIndex, { blocks }) })
    }
  },

  deleteBlock(index) {
    const { images, currentIndex } = get()
    const entry = images[currentIndex]
    if (!entry) return
    set({ images: updateCurrent(images, currentIndex, { blocks: entry.blocks.filter((_, i) => i !== index) }) })
  },

  addBlock(block) {
    const { images, currentIndex } = get()
    const entry = images[currentIndex]
    if (!entry) return
    set({ images: updateCurrent(images, currentIndex, { blocks: [...entry.blocks, block] }) })
  },

  setStatus(status, error) {
    const { images, currentIndex } = get()
    set({ images: updateCurrent(images, currentIndex, { status, error: error ?? null }) })
  },

  setImageBase64At(imageIndex, b64) {
    const { images } = get()
    set({ images: updateCurrent(images, imageIndex, { imageBase64: b64 }) })
  },

  setBlocksAt(imageIndex, blocks, bboxReady = false) {
    const { images } = get()
    set({ images: updateCurrent(images, imageIndex, { blocks, bboxReady }) })
  },

  setStatusAt(imageIndex, status, error) {
    const { images } = get()
    set({ images: updateCurrent(images, imageIndex, { status, error: error ?? null }) })
  },

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setFontFamily: (font) => set({ fontFamily: font }),
}))
