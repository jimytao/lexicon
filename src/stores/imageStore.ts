import { create } from 'zustand'
import type { TextBlock } from '../types'

type TranslateStatus = 'idle' | 'loading' | 'done' | 'error'

export const FONT_OPTIONS = [
  { value: '"ZCOOL KuaiLe", cursive', label: '快乐体（可爱圆润）' },
  { value: '"Ma Shan Zheng", cursive', label: '马善政（毛笔手写）' },
  { value: '"Long Cang", cursive', label: '龙藏（硬笔手写）' },
  { value: '"Noto Sans SC", "Microsoft YaHei", sans-serif', label: '默认黑体' },
] as const

interface ImageState {
  imageUrl: string | null
  imageFile: File | null
  sourceLang: string
  targetLang: string
  fontFamily: string
  blocks: TextBlock[]
  status: TranslateStatus
  error: string | null

  setImage: (file: File) => void
  clearImage: () => void
  setSourceLang: (lang: string) => void
  setTargetLang: (lang: string) => void
  setFontFamily: (font: string) => void
  setBlocks: (blocks: TextBlock[]) => void
  updateBlock: (index: number, translation: string) => void
  setStatus: (status: TranslateStatus, error?: string) => void
}

export const useImageStore = create<ImageState>((set, get) => ({
  imageUrl: null,
  imageFile: null,
  sourceLang: 'auto',
  targetLang: '中文',
  fontFamily: FONT_OPTIONS[0].value,
  blocks: [],
  status: 'idle',
  error: null,

  setImage(file) {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ imageFile: file, imageUrl: URL.createObjectURL(file), blocks: [], status: 'idle', error: null })
  },

  clearImage() {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ imageFile: null, imageUrl: null, blocks: [], status: 'idle', error: null })
  },

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setFontFamily: (font) => set({ fontFamily: font }),
  setBlocks: (blocks) => set({ blocks }),

  updateBlock(index, translation) {
    const blocks = [...get().blocks]
    if (blocks[index]) {
      blocks[index] = { ...blocks[index], translation }
      set({ blocks })
    }
  },

  setStatus(status, error) {
    set({ status, error: error ?? null })
  },
}))
