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
  imageBase64: string | null  // cached for second-stage bbox request
  sourceLang: string
  targetLang: string
  fontFamily: string
  blocks: TextBlock[]
  bboxReady: boolean  // true once blocks have bbox data
  status: TranslateStatus
  error: string | null

  setImage: (file: File) => void
  setImageBase64: (b64: string) => void
  clearImage: () => void
  setSourceLang: (lang: string) => void
  setTargetLang: (lang: string) => void
  setFontFamily: (font: string) => void
  setBlocks: (blocks: TextBlock[], bboxReady?: boolean) => void
  updateBlock: (index: number, partial: Partial<TextBlock>) => void
  deleteBlock: (index: number) => void
  addBlock: (block: TextBlock) => void
  setStatus: (status: TranslateStatus, error?: string) => void
}

export const useImageStore = create<ImageState>((set, get) => ({
  imageUrl: null,
  imageFile: null,
  imageBase64: null,
  sourceLang: 'auto',
  targetLang: '中文',
  fontFamily: FONT_OPTIONS[0].value,
  blocks: [],
  bboxReady: false,
  status: 'idle',
  error: null,

  setImage(file) {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ imageFile: file, imageUrl: URL.createObjectURL(file), imageBase64: null, blocks: [], bboxReady: false, status: 'idle', error: null })
  },

  setImageBase64(b64) { set({ imageBase64: b64 }) },

  clearImage() {
    const prev = get().imageUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ imageFile: null, imageUrl: null, imageBase64: null, blocks: [], bboxReady: false, status: 'idle', error: null })
  },

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),
  setFontFamily: (font) => set({ fontFamily: font }),
  setBlocks: (blocks, bboxReady = false) => set({ blocks, bboxReady }),

  updateBlock(index, partial) {
    const blocks = [...get().blocks]
    if (blocks[index]) {
      blocks[index] = { ...blocks[index], ...partial }
      set({ blocks })
    }
  },

  deleteBlock(index) {
    set({ blocks: get().blocks.filter((_, i) => i !== index) })
  },

  addBlock(block) {
    set({ blocks: [...get().blocks, block] })
  },

  setStatus(status, error) {
    set({ status, error: error ?? null })
  },
}))
