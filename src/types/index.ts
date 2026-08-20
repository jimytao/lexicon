export type Mode = 'instant' | 'ai' | 'core'
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
  senseIndex?: number
  zh: string
  en: string
  pos?: string
  scene?: Scene
  imageQuery?: string
}

export interface EtymologyPart {
  segment: string
  meaning: string
  sourceForm?: string    // original Latin/Greek root form, e.g. "legere (拉丁语)"
  anchor?: string        // a common familiar word sharing this root, e.g. "select"
  anchorNote?: string    // 1 Chinese sentence: how anchor demonstrates this root's meaning
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

export interface MeaningExercise {
  sentence: string
  targetMeaning?: string
  hint?: string
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

export interface UnnaturalMindModel {
  chineseThought: string
  nativeConcept: string
  reusablePrinciple: string
}

export interface CoreConcept {
  image: string
  explanation: string
  /** Pure Core：短对译/义核（词典式，非情景散文）；Lookup meanings 已有释义墙时可选 */
  gloss?: string
  /** Pure Core：感觉锚（原 Mental Picture 压缩，不写长场景） */
  feelAnchor?: string
  /** Pure Core：情绪底色（原 Emotional Stance） */
  emotionalTone?: string
}

/** Pure Core L2：主词 vs 近义选用对照 */
export interface WordChoiceContrastItem {
  vs: string
  reason: string
}

/** Concept-tree leaf: phrase + required explanation (legacy caches may still be bare strings). */
export interface ConceptGraphExample {
  phrase: string
  /** 中文/英文释义：这个表达是什么意思 */
  meaning: string
  /** Pure Core：母语者心智/意象延伸（为何从 Core 落到这个用法） */
  mindHint?: string
}

export interface ConceptGraph {
  rootCore: string
  branches: Array<{
    category: string
    explanation?: string
    /** Prefer ConceptGraphExample; string kept for old cache compatibility */
    examples: Array<string | ConceptGraphExample>
  }>
}

export interface Synonym {
  word: string
  distinction: string
  tone?: 'positive' | 'negative' | 'neutral' | 'informal'
  whenToUse?: string
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
  coreConcept?: CoreConcept
}

export interface CollocationEntry {
  chunk: string   // e.g. "take the tram" / "black tea"
  /** 必填释义：短语/搭配的中文或英文意思（勿只写空泛「常用」） */
  note?: string
  spatialExtension?: string // 空间/逻辑意象延伸 (e.g. "take off -> 掌控 + 脱离 = 飞离/突然成功")
}

export interface CollocationData {
  /** 常用介词词组（prep+N / V+prep(+N) 等） */
  chunks: CollocationEntry[]
  /** 其他常用词组（adj+N、V+N、不含介词重心的搭配） */
  collocations: CollocationEntry[]
}

export interface AiAnalysis {
  coreConcept?: CoreConcept
  meanings: Array<{ senseIndex?: number; zh: string; pos?: string; scene?: Scene; imageQuery?: string }>
  etymology: Etymology
  synonyms: Synonym[]
  antonyms?: Antonym[]
  mnemonic?: Mnemonic
  examples?: Example[]
  collocations?: CollocationData
  culturalLore?: {
    title?: string     // 2-4 word tag, e.g. "Gen-Z Slang" / "Formal Register"
    content?: string   // 1-2 sentences: cultural origin, register shift, or notable usage
    register?: string  // optional: formal | informal | slang | technical | neutral
  }
  conceptGraph?: ConceptGraph
}

export interface NativeMindModel {
  mentalPicture: string
  emotionalStance: string
  whyChooseThisWord: string
}

export interface AiFullResult {
  correctForm: string
  phonetic: string
  pos: string
  coreConcept?: CoreConcept
  meanings: Array<{ senseIndex?: number; zh: string; en: string; pos?: string; scene?: Scene; imageQuery?: string }>
  etymology?: Etymology
  synonyms?: Synonym[]
  antonyms?: Antonym[]
  examples?: Example[]
  mnemonic?: Mnemonic
  culturalLore?: {
    title?: string
    content?: string
    subculture?: string
  }
  collocations?: CollocationData
  conceptGraph?: ConceptGraph
  /** @deprecated 旧缓存兼容；新 Core 用 coreConcept.feelAnchor/emotionalTone + wordChoiceContrast */
  nativeMindModel?: NativeMindModel
  /** Pure Core：结构化选用对照（L2），优先于 whyChoose 散文 */
  wordChoiceContrast?: WordChoiceContrastItem[]
  /** Pure Core：母语者常用场景/句式（非词典释义墙） */
  usageScenes?: Array<{ label: string; description: string }>
}

export type WordAIResult = AiFullResult

export interface PrepSpatialItem {
  preposition: string
  coreIdea: string
  phraseExplanation: string
  smartAssoc: string
}

export interface PrepSpatialData {
  items: PrepSpatialItem[]
}

/** Lookup vs Pure Core cognitive track (words + phrases share this). */
export type CognitiveMode = 'lookup' | 'core'
/** @deprecated alias — use CognitiveMode */
export type PhraseCognitiveMode = CognitiveMode

export interface PhraseResult {
  phrase: string
  correctForm: string
  correctionNote?: string
  /** Tier 2: Polished native or formal expression */
  nativeForm?: string
  /** Tier 2: Explanation of why native speakers choose this phrase/preposition */
  nativeRationale?: string
  unnaturalMindModel?: UnnaturalMindModel
  /** @deprecated 旧缓存兼容；新 Core 用 feelAnchor/emotionalTone + wordChoiceContrast */
  nativeMindModel?: NativeMindModel
  feelAnchor?: string
  emotionalTone?: string
  wordChoiceContrast?: WordChoiceContrastItem[]
  meaning: string
  /** Usage Contexts 开场白：情景/语域/母语选用意图（勿塞进 meaning） */
  usageIntro?: string
  usageScenes?: Array<{ label: string; description: string }>
  examples: Example[]
  mnemonic?: Mnemonic
  culturalLore?: {
    title?: string
    content?: string
    subculture?: string
  }
  prepSpatial?: PrepSpatialData
}

export type PhraseAnalysisResult = PhraseResult

/**
 * Combined AI result carrying both Lookup ("understand") and Core ("use it") data
 * from a single AI call. Tab buttons switch between the two views without a new call.
 */
export interface CombinedAiResult {
  /** AI Lookup view — meanings, etymology, examples, memory aids */
  lookup: AiFullResult
  /** Pure Core view — native-mind image, concept graph, usage scenes */
  core: AiFullResult
}

/**
 * Combined phrase/sentence result for phrase-type queries.
 */
export interface CombinedPhraseResult {
  lookup: PhraseResult
  core: PhraseResult
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
  translationEn?: string
  bbox: { x: number; y: number; w: number; h: number }
  polygon?: Array<{ x: number; y: number }>
  type: TextBlockType
  direction: TextDirection
  rotation?: number
}

// ── User Language Profile & Lexicon Memory (Phase 5) ──

export interface WeaknessPattern {
  id: string
  description: string
  sourceTrigger: string
  track: 'vocabulary' | 'phrase_metaphor' | 'syntax_thought'
  status: 'learning' | 'mastered'
  occurrenceCount: number
  contrastExample?: string
}

export interface ExplorationFocus {
  category: string
  searchedItems: string[]
}

export interface ProfileRecommendation {
  conceptOrWord: string
  reason: string
}

export interface UserLanguageProfile {
  lastUpdated: string
  totalDiagnosticsRun: number
  weaknessPatterns: WeaknessPattern[]
  recentExplorationFocus: ExplorationFocus[]
  recommendations: ProfileRecommendation[]
}

export interface UserWordMemory {
  word: string
  firstSearchedAt: string
  lastViewedAt: string
  searchCount: number
  userNotes?: string
  aiConversationsJson?: string
  savedCoreConcept?: string
}

