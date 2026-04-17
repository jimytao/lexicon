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
  meanings: Array<{ zh: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
}

export interface AiFullResult {
  correctForm: string
  phonetic: string
  pos: string
  meanings: Array<{ zh: string; en: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
  examples: Example[]
}

export interface PhraseResult {
  phrase: string
  correctForm: string
  meaning: string
  usageScenes: Array<{ label: string; description: string }>
  examples: Example[]
  exercises: Exercise[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── 图片翻译 ──

export type TextBlockType = 'bubble' | 'sfx' | 'caption'

export type TextDirection = 'vertical' | 'horizontal'

export interface TextBlock {
  original: string
  translation: string
  bbox: { x: number; y: number; w: number; h: number }
  polygon?: Array<{ x: number; y: number }>  // normalized 0-1, bubble outline vertices (bubble/caption only)
  type: TextBlockType
  direction: TextDirection
  // Optional per-block color overrides (bubble/caption background)
  colorHue?: number        // hue shift in degrees, -180~180, default 0
  colorSaturation?: number // saturation multiplier 0~2, default 1
  colorOpacity?: number    // opacity 0~1, default 1
}

export interface ImageTranslation {
  imageUrl: string
  blocks: TextBlock[]
  sourceLang: string
  targetLang: string
}
