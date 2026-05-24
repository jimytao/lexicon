export type Mode = 'instant' | 'ai'
export type QueryType = 'word' | 'phrase' | 'sentence'
export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'other'

export interface SuggestItem {
  word: string
  zhBrief: string
}

export interface Scene {
  label: string
  description: string
}

export interface Meaning {
  zh: string
  en: string
  pos?: string
  scene?: Scene
}

export interface EtymologyPart {
  segment: string
  meaning: string
}

export interface DerivedWord {
  word: string
  pos: string
  meaning: string
}

export interface Etymology {
  parts: EtymologyPart[]
  story: string
  derivedWords: DerivedWord[]
}

export interface Exercise {
  scenario: string
}

export interface MnemonicItem {
  content: string
  score: number
  reason: string
}

export interface Mnemonic {
  philology: MnemonicItem
  story: MnemonicItem
  smart: MnemonicItem
  bestType: 'philology' | 'story' | 'smart'
}

export interface EvaluationResult {
  correct: boolean
  feedback: string
  correction: string
}

export interface Synonym {
  word: string
  distinction: string
}

export interface Antonym {
  word: string
  distinction: string
}

export interface Example {
  en: string
  zh: string
}

export interface WordResult {
  word: string
  phonetic: string
  pos: string
  meanings: Meaning[]
  examples: Example[]
  etymology?: Etymology
  synonyms?: Synonym[]
}

export interface AiAnalysis {
  meanings: Array<{ zh: string; pos?: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
  antonyms?: Antonym[]
  mnemonic?: Mnemonic
}

export interface AiFullResult {
  correctForm: string
  phonetic: string
  pos: string
  meanings: Array<{ zh: string; en: string; pos?: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
  antonyms?: Antonym[]
  examples: Example[]
  mnemonic?: Mnemonic
  culturalLore?: {
    title?: string
    content?: string
    subculture?: string
  }
}

export interface PhraseResult {
  phrase: string
  correctForm: string
  meaning: string
  usageScenes: Array<{ label: string; description: string }>
  examples: Example[]
  mnemonic?: Mnemonic
  culturalLore?: {
    title?: string
    content?: string
    subculture?: string
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── 图片翻译 ──

export type TextBlockType = 'bubble' | 'sfx' | 'caption'

export type TextDirection = 'vertical' | 'horizontal'

export interface TextRegion {
  id: string
  original: string
  translation: string
  type: TextBlockType
  direction: TextDirection
  // AI-detected position information
  detectedBbox: { x: number; y: number; w: number; h: number }
  detectedPolygon?: Array<{ x: number; y: number }>
  visualReference?: string  // AI description for position verification
  detectedMaskShape?: 'ellipse' | 'rect' | 'rounded-rect' | 'circle' | 'capsule' | 'diamond' | 'burst' | 'none' // AI recommended mask shape
}

export interface L1Polygon {
  regionId: string  // Links to TextRegion.id
  polygon: Array<{ x: number; y: number }>
  // L1 polygon fill color — completely independent from L2
  l1ColorHue?: number
  l1ColorSaturation?: number
  l1ColorOpacity?: number
  rotation?: number
}

export interface L2Text {
  regionId: string  // Links to TextRegion.id
  // L2 text positioning — independent from L1
  bbox: { x: number; y: number; w: number; h: number }
  // L2 text background color (for non-polygon blocks)
  colorHue?: number
  colorSaturation?: number
  colorOpacity?: number
  rotation?: number
}

// Legacy TextBlock for backward compatibility
export interface TextBlock {
  original: string
  translation: string
  bbox: { x: number; y: number; w: number; h: number }
  polygon?: Array<{ x: number; y: number }>  // normalized 0-1, bubble outline vertices (bubble/caption only)
  type: TextBlockType
  direction: TextDirection
  // L2 text background color (non-polygon blocks)
  colorHue?: number        // hue shift in degrees, -180~180, default 0
  colorSaturation?: number // saturation multiplier 0~2, default 1
  colorOpacity?: number    // opacity 0~1, default 1
  // L1 polygon fill color (polygon blocks only) — separate from L2
  l1ColorHue?: number
  l1ColorSaturation?: number
  l1ColorOpacity?: number  // default 1 (opaque white)
  rotation?: number        // rotation in degrees, default 0

  // ─── 扩展的自定义样式属性 ───
  textColor?: string           // 文本颜色 (Hex, 例如 #ffffff, 默认自动反色)
  fontSizeMode?: 'auto' | 'custom' // 字号大小模式：自动缩放或固定大小
  fontSizeCustom?: number      // 自定义字号 (px)
  fontSizeMultiplier?: number  // 字号缩放比例 (例如 0.5 ~ 2.0)
  fontFamilyCustom?: string    // 自定义字体，覆盖全局字体
  fontWeight?: 'normal' | 'bold' // 字重
  fontStyle?: 'normal' | 'italic' // 字形
  textAlign?: 'left' | 'center' | 'right' // 对齐方式
  lineHeight?: number          // 行高 (默认 1.3)

  strokeEnabled?: boolean      // 是否启用文字描边
  strokeColor?: string         // 描边颜色
  strokeWidth?: number         // 描边粗细 (px)

  fillColorMode?: 'auto' | 'custom' | 'transparent' // 擦除模式：自动采样、自定义颜色、无擦除（透明）
  fillColorCustom?: string     // 自定义擦除背景色
  fillOpacity?: number         // 填充不透明度 (0~1, 默认 1)
  maskShape?: 'ellipse' | 'rect' | 'rounded-rect' | 'polygon' | 'none' | 'circle' | 'capsule' | 'diamond' | 'burst' | 'magic-wand' // 遮罩形状选项
  magicMaskUrl?: string        // 魔棒擦除生成的 Data URL
  magicMaskBbox?: { x: number; y: number; w: number; h: number } // 魔棒遮罩的原始象素坐标 Bbox
}

export interface ImageTranslation {
  imageUrl: string
  blocks: TextBlock[]
  sourceLang: string
  targetLang: string
}
