export type Mode = 'instant' | 'ai'

export type QueryType = 'word' | 'phrase' | 'sentence'

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

export interface Mnemonic {
  type: 'story' | 'philology' | 'smart'
  content: string
  score: number
  allScores: {
    philology: number
    story: number
    smart: number
  }
  reason: string
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
  mnemonic?: Mnemonic
}

export interface AiFullResult {
  correctForm: string
  phonetic: string
  pos: string
  meanings: Array<{ zh: string; en: string; pos?: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
  examples: Example[]
  mnemonic?: Mnemonic
}

export interface PhraseResult {
  phrase: string
  correctForm: string
  meaning: string
  usageScenes: Array<{ label: string; description: string }>
  examples: Example[]
  exercises: Exercise[]
  mnemonic?: Mnemonic
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
}

export interface ImageTranslation {
  imageUrl: string
  blocks: TextBlock[]
  sourceLang: string
  targetLang: string
}
