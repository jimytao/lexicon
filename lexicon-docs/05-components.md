# 05 — React 组件树与状态管理

## 组件树总览

```
<App>
├── <SettingsDrawer />          # 右滑抽屉，全局覆盖
├── Tab 切换栏                   # 「查词」/「图片翻译」
└── <main>
    │
    ├── (view === 'translate')
    │   └── <ImageTranslateView />    # 图片上传 + AI 翻译 + Tesseract OCR
    │       ├── 语言选择器（源→目标）
    │       ├── 拖拽/点击上传区域
    │       ├── 图片预览 + 移除按钮
    │       ├── 翻译按钮 → AI Phase 1（OCR + 译文，无 bbox）
    │       ├── <TranslationList />   # 翻译结果列表（可编辑译文）
    │       ├── 「翻译列表」/「嵌字预览」模式切换
    │       │   └── 嵌字 → Tesseract OCR 获取精确 bbox → 与 Phase 1 译文模糊匹配
    │       ├── <ImageEditor />       # Canvas 嵌字（去原文+贴译文，forwardRef 暴露 exportBlob）
    │       ├── <BlockOverlay />      # 交互式 bbox/polygon 编辑器
    │       └── <ExportButton />      # 导出合成 PNG
    │
    ├── (view === 'dictionary')
    ├── <SearchBar />           # 始终顶部常驻
    │   ├── input
    │   ├── <ModeToggle />      # Instant / AI mode 切换
    │   └── <HistoryList />     # 聚焦且无输入时显示，最近查词 + 删除/清空
    │
    ├── <SuggestList />         # 有输入时展开补全列表
    │
    └── (条件渲染，三选一)
        │
        ├── <ResultView />          # 词库有结果时渲染
        │   ├── <WordHeader />      # 单词、音标、词性 badge（深色模式适配）
        │   ├── <InstantSection />  # 始终渲染（L1 内容）
        │   │   ├── <MeaningList />      # >4 条义项可折叠
        │   │   ├── <PhrasesSection />   # 相关词组，可点击查词，>6 条折叠
        │   │   └── <ExampleList />      # >3 条例句可折叠
        │   └── <AiSection />       # 仅 AI mode 渲染
        │       ├── <AiStatusBar /> # 加载中 / 错误 / 成功 状态
        │       ├── <SemanticScene />
        │       ├── <EtymologyCard />  # 词根 pills + story + 派生词列表
        │       ├── <SynonymList />
        │       ├── <PracticeSection /> # 按需生成练习
        │       └── <AiChatBox />      # AI 问答框，多轮对话
        │
        ├── <AiFullView />          # 词库无结果 + 单词类型 → AI 全量查词
        │   ├── "AI 查询" badge
        │   ├── <WordHeader />      # 显示 correctForm（AI 纠正后的拼写）
        │   ├── 拼写纠正提示         # 用户输入与 correctForm 不同时显示
        │   ├── <MeaningList />
        │   ├── <SemanticScene />
        │   ├── <EtymologyCard />
        │   ├── <SynonymList />
        │   ├── <PracticeSection />
        │   ├── <ExampleList />
        │   └── <AiChatBox />
        │
        └── <PhraseView />          # 词组/句子 → AI 词组查询
            ├── "AI 查询 · 词组/句子" badge
            ├── 标题（correctForm 或原始输入）+ 拼写纠正提示
            ├── 释义
            ├── 使用场景卡片
            ├── <ExampleList />
            ├── <PhraseExercises />  # 内联练习（AI 返回的 exercises）
            └── <AiChatBox />
```

## Zustand Store 设计

### searchStore

```ts
// src/stores/searchStore.ts
import { create } from 'zustand'

interface SearchStore {
  query: string              // 搜索框当前内容
  queryType: QueryType       // 'word' | 'phrase' | 'sentence'，setQuery 时自动推断
  suggestions: SuggestItem[] // 补全列表
  mode: Mode                 // 'instant' | 'ai'
  setQuery: (q: string) => void
  setQueryType: (t: QueryType) => void
  setMode: (m: Mode) => void
  setSuggestions: (s: SuggestItem[]) => void
  clear: () => void
}

// detectQueryType(input): 含标点或 ≥5 词 → sentence，含空格 → phrase，其余 → word
// setQuery 内部自动调用 detectQueryType
```

### resultStore

```ts
// src/stores/resultStore.ts
import { create } from 'zustand'

type AiStatus = 'idle' | 'loading' | 'success' | 'error'

interface ResultStore {
  wordResult: WordResult | null
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiFullResult: AiFullResult | null      // AI 全量查词结果（词库缺失时）
  phraseResult: PhraseResult | null      // AI 词组/句子查询结果
  chatMessages: ChatMessage[]            // AI 问答对话历史（切换查询时清空）
  aiStatus: AiStatus
  aiError: string | null
  aiCache: Map<string, AiAnalysis>
  aiFullCache: Map<string, AiFullResult>
  phraseCache: Map<string, PhraseResult>

  setWordResult: (r: WordResult | null) => void  // 同时重置 aiFullResult/phraseResult/chatMessages
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  setAiFullResult: (word: string, r: AiFullResult) => void
  setPhraseResult: (key: string, r: PhraseResult) => void
  setChatMessages: (msgs: ChatMessage[]) => void
  addChatMessage: (msg: ChatMessage) => void
  setAiError: (e: string) => void
  getCachedAi: (word: string) => AiAnalysis | null
  getCachedAiFull: (word: string) => AiFullResult | null
  getCachedPhrase: (key: string) => PhraseResult | null
  reset: () => void
}
```

### settingsStore

```ts
// src/stores/settingsStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsStore {
  aiProvider: string              // 选中的服务商 id（如 'gemini'、'openai'、'custom'）
  aiEndpoint: string
  aiModel: string
  aiApiKeys: Record<string, string>  // 按 providerId 存储，如 { gemini: 'AIza...' }
  historyEnabled: boolean
  darkMode: boolean               // 深色模式，手动切换，persist 到 localStorage
  maxExercises: number            // 练习题数，1–10，默认 5
  activeDictionary: 'lexicon.db' | 'lexicon_en.db' // 当前本地词库文件
  autoSwitchDictionary: boolean    // 是否开启单语言模式自动切换词典
  setAiProvider: (v: string) => void
  setAiEndpoint: (v: string) => void
  setAiModel: (v: string) => void
  setApiKeyForProvider: (providerId: string, key: string) => void
  setHistoryEnabled: (v: boolean) => void
  setDarkMode: (v: boolean) => void
  setMaxExercises: (v: number) => void
  setActiveDictionary: (v: 'lexicon.db' | 'lexicon_en.db') => void
  setAutoSwitchDictionary: (v: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: '',
      aiEndpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      aiModel: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      aiApiKeys: {},
      historyEnabled: true,
      darkMode: false,
      maxExercises: 5,
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) => set({ aiModel }),
      setApiKeyForProvider: (providerId, key) =>
        set((state) => ({ aiApiKeys: { ...state.aiApiKeys, [providerId]: key } })),
      setHistoryEnabled: (historyEnabled) => set({ historyEnabled }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setMaxExercises: (maxExercises) => set({ maxExercises }),
    }),
    { name: 'lexicon-settings' }
  )
)
```

### historyStore

```ts
// src/stores/historyStore.ts
// 独立于 DBService，完全在 localStorage 持久化，最多保留 100 条

interface HistoryStore {
  words: string[]
  add: (word: string) => void    // 置顶，去重
  remove: (word: string) => void
  clear: () => void
}

// persist key: 'lexicon-history'
```

## 核心自定义 Hook

### useSearch

```ts
// src/hooks/useSearch.ts
// 负责：debounce 查询补全 + 按 queryType 分支处理查词

export function useSearch() {
  // 300ms debounce 触发补全（单词模式排除词组，词组模式匹配词组）

  // selectWord 流程：
  // 1. detectQueryType(word) → word / phrase / sentence
  // 2. sentence → 不查词库，直接 AI 词组查询，自动切 AI mode
  // 3. phrase → 先 db.lookup，无结果则 AI 词组查询，自动切 AI mode
  // 4. word → 先 db.lookup，无结果则 AI 全量查词，自动切 AI mode
  // 5. 有结果 → 正常流程（AI mode 下触发 analyzeWord）

  return { query, setQuery, selectWord }
}
```

### useAiLookup

```ts
// src/hooks/useAiLookup.ts
// 负责：调用 AI API，管理 AbortController，写入 cache
// 导出三个触发函数：

export function useAiLookup() {
  // trigger(word, meanings) — 标准 AI 分析（词库有结果时）
  // triggerFullLookup(word) — AI 全量查词（词库无结果时）
  // triggerPhraseQuery(phrase) — AI 词组/句子查询
  // 三者共享 AbortController，互斥执行

  return { trigger, triggerFullLookup, triggerPhraseQuery }
}
```

## 各组件 Props 接口

```ts
// SearchBar
interface SearchBarProps {
  onWordSelect: (word: string) => void
}

// HistoryList
interface HistoryListProps {
  onSelect: (word: string) => void  // 点击历史词等同于选词查询
}
// 读取 historyStore，支持单条 remove + 全部 clear

// SuggestList
interface SuggestListProps {
  items: SuggestItem[]
  onSelect: (word: string) => void
  visible: boolean
}

// WordHeader
interface WordHeaderProps {
  word: string
  phonetic: string
  pos: string
}

// MeaningList
interface MeaningListProps {
  meanings: Meaning[]
  scenes?: Scene[]    // AI mode 时传入，与 meanings 对应
}

// ExampleList
interface ExampleListProps {
  examples: Example[]
}

// SemanticScene
interface SemanticSceneProps {
  meanings: Array<{ zh: string; scene: Scene }>
}

// EtymologyCard
interface EtymologyCardProps {
  etymology: Etymology
}

// SynonymList
interface SynonymListProps {
  synonyms: Synonym[]
  onSynonymClick: (word: string) => void  // 点击近义词可直接查词
}

// AiStatusBar
interface AiStatusBarProps {
  status: AiStatus
  error: string | null
  onRetry: () => void
}

// SkeletonBlock（通用 skeleton 组件）
interface SkeletonBlockProps {
  lines?: number      // 显示几行骨架
  variant?: 'text' | 'pill' | 'card'
}
```

## 关键交互时序

```
用户输入 "satisf"（单词模式）
  → debounce 300ms
  → db.suggest("satisf")，排除词组 [<5ms]
  → 渲染 SuggestList

用户输入 "good for"（词组模式）
  → debounce 300ms
  → db.suggest("good for")，前缀 + 模糊匹配词组条目
  → 渲染 SuggestList（词组建议）

用户点击 "satisfaction"（词库有结果）
  → db.lookup("satisfaction") [<10ms]
  → 渲染 WordHeader + InstantSection 立即可见
  → if mode === 'ai':
      → AiSection 渲染 skeleton
      → analyzeWord() [1-3s]
      → 数据返回 → skeleton 淡出，内容淡入
      → 末尾显示 AiChatBox

用户搜索 "RAG"（词库无结果，word 类型）
  → db.lookup("RAG") → null
  → 自动切到 AI mode
  → 渲染 AiFullView skeleton
  → aiFullLookup("RAG") [1-3s]
  → 返回 correctForm + 完整信息 → 渲染带「AI 查询」标签的视图

用户搜索 "it's good to me to do"（phrase 类型）
  → db.lookup → null
  → 自动切到 AI mode
  → 渲染 PhraseView skeleton
  → aiPhraseQuery() [1-3s]
  → 返回 correctForm="it's good for me to do" + 释义/场景/例句/练习
  → 大字显示正确形式，小字标注用户输入错误

用户在 AiChatBox 提问
  → askQuestion(context, history) [1-3s]
  → 回答追加到 chatMessages（气泡展示）
  → 切换查询时 chatMessages 清空
```
