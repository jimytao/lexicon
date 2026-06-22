import { create } from 'zustand'
import type { TextBlock } from '../types'

type TranslateStatus = 'idle' | 'loading' | 'done' | 'error'

export interface ImageEntry {
  id: string
  file: File
  imageUrl: string
  imageBase64: string | null
  blocks: TextBlock[]
  status: TranslateStatus
  error: string | null
}

interface ImageState {
  images: ImageEntry[]
  currentIndex: number
  sourceLang: string
  targetLang: string

  addImages: (files: File[]) => void
  removeCurrentImage: () => void
  clearAll: () => void
  setCurrentIndex: (index: number) => void

  updateBlock: (index: number, partial: Partial<TextBlock>) => void
  setImageBase64At: (imageIndex: number, b64: string) => void
  setBlocksAt: (imageIndex: number, blocks: TextBlock[]) => void
  setStatusAt: (imageIndex: number, status: TranslateStatus, error?: string) => void

  setSourceLang: (lang: string) => void
  setTargetLang: (lang: string) => void
}

function makeEntry(file: File): ImageEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    imageUrl: URL.createObjectURL(file),
    imageBase64: null,
    blocks: [],
    status: 'idle',
    error: null,
  }
}

function updateAt(images: ImageEntry[], index: number, patch: Partial<ImageEntry>): ImageEntry[] {
  return images.map((img, i) => i === index ? { ...img, ...patch } : img)
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  currentIndex: 0,
  sourceLang: 'auto',
  targetLang: 'Chinese',

  addImages(files) {
    const newEntries = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(makeEntry)
    if (newEntries.length === 0) return
    const { images } = get()
    set({ images: [...images, ...newEntries], currentIndex: images.length })
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

  updateBlock(index, partial) {
    const { images, currentIndex } = get()
    const entry = images[currentIndex]
    if (!entry) return
    const blocks = [...entry.blocks]
    if (blocks[index]) {
      blocks[index] = { ...blocks[index], ...partial }
      set({ images: updateAt(images, currentIndex, { blocks }) })
    }
  },

  setImageBase64At(imageIndex, b64) {
    const { images } = get()
    set({ images: updateAt(images, imageIndex, { imageBase64: b64 }) })
  },

  setBlocksAt(imageIndex, blocks) {
    const { images } = get()
    set({ images: updateAt(images, imageIndex, { blocks }) })
  },

  setStatusAt(imageIndex, status, error) {
    const { images } = get()
    set({ images: updateAt(images, imageIndex, { status, error: error ?? null }) })
  },

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),
}))
