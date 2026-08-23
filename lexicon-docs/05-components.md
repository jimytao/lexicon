# 05 — React 组件树与状态管理

## 组件树总览

```
<App>
├── 底部导航（3 Tab，i18n）        # Dict / Image / Settings；首次挂载后 hidden 保活
└── <main>
    │
    ├── (view === 'dictionary')
    │   ├── <SearchBar /> + <SegmentedControl />   # Instant / AI / Core
    │   └── 条件渲染
    │       ├── <ResultView />         # 词库命中 + Instant/AI (+ LexiconMemoryBadge 只读)
    │       ├── <CoreCognitiveView />  # Mode 3 Core（Usage Image + WordGraph + WordChoice…；无置顶 NativeMind）
    │       ├── <AiFullView />         # 词库无结果全量查词 (+ Badge 只读)
    │       └── <PhraseView />         # 词组/句子；Lookup vs Core 分轨（Core：感觉/情绪附释义；wordChoice 可拖）
    │           └── 共用 <SectionHeading />  # 结果页板块标题（无色点/无 AI pill/无 emoji）
    │
    ├── (view === 'translate')
    │   └── <ImageTranslateView />
    │       └── <CameraModal />            # Web / Desktop 摄像头实时拍照模态框
    │
    └── (view === 'settings')
        └── <SettingsView />           # Group + Accordion + ProfileModal
            └── <ProfileModal />       # Profile 弱项查看/重置（首页看板 Digest 已雪藏）

# SHELVED（未挂载，勿接回导航 / 结果页）
# ├── <MemoryView />
# ├── <AILearningDigestCard />
# └── <UserNoteEditor />              # DB API 保留；结果页不挂载
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
  // chat 已迁至 chatStore（persist lexicon-chat）；key = cognitiveCacheKey(word, lookup|core)
  aiStatus: AiStatus
  aiError: string | null
  aiCache: Map<string, AiAnalysis>
  aiFullCache: Map<string, AiFullResult>
  phraseCache: Map<string, PhraseResult>

  setWordResult: (r: WordResult | null) => void  // 同时重置 aiFullResult/phraseResult
  setRelatedPhrases: (phrases: SuggestItem[]) => void
  setAiStatus: (s: AiStatus) => void
  setAiAnalysis: (word: string, a: AiAnalysis) => void
  setAiFullResult: (word: string, r: AiFullResult) => void
  setPhraseResult: (key: string, r: PhraseResult) => void
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
  appearance: 'light' | 'dark' | 'system'  // 外观偏好；system 跟随 OS；persist
  maxExercises: number            // 练习题数，1–10，默认 5
  activeDictionary: 'lexicon.db' | 'lexicon_en.db' // 当前本地词库文件
  autoSwitchDictionary: boolean    // 是否开启单语言模式自动切换词典
  chatRichContextDefault: boolean  // Chat 默认开启完整语境
  pronunciationAccent: 'uk' | 'us' // 默认发音口音偏好
  autoPlayPronunciation: boolean  // 查词时自动播放发音
  setAiProvider: (v: string) => void
  setAiEndpoint: (v: string) => void
  setAiModel: (v: string) => void
  setApiKeyForProvider: (providerId: string, key: string) => void
  setHistoryEnabled: (v: boolean) => void
  setAppearance: (v: 'light' | 'dark' | 'system') => void
  setMaxExercises: (v: number) => void
  setActiveDictionary: (v: 'lexicon.db' | 'lexicon_en.db') => void
  setAutoSwitchDictionary: (v: boolean) => void
  setChatRichContextDefault: (v: boolean) => void
  setPronunciationAccent: (v: 'uk' | 'us') => void
  setAutoPlayPronunciation: (v: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: '',
      aiEndpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      aiModel: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      aiApiKeys: {},
      historyEnabled: true,
      appearance: 'system',
      maxExercises: 5,
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) => set({ aiModel }),
      setApiKeyForProvider: (providerId, key) =>
        set((state) => ({ aiApiKeys: { ...state.aiApiKeys, [providerId]: key } })),
      setHistoryEnabled: (historyEnabled) => set({ historyEnabled }),
      setAppearance: (appearance) => set({ appearance }),
      setMaxExercises: (maxExercises) => set({ maxExercises }),
    }),
    {
      name: 'lexicon-settings',
      // merge: legacy `darkMode: boolean` → appearance light|dark；无值则 system
    }
  )
)
```

### appearance（主题解析）

```ts
// src/services/appearance.ts
export type AppearanceMode = 'light' | 'dark' | 'system'
export function resolveDark(appearance, systemPrefersDark?): boolean
export function applyDocumentAppearance(isDark: boolean): void
export function subscribeSystemPrefersDark(onChange): () => void
export async function syncNativeWindowTheme(appearance): Promise<void> // Tauri setTheme；Web/Capacitor no-op
```

- `App.tsx`：按 `appearance` 同步 `html.dark` + `color-scheme`；`system` 时监听 `matchMedia`
- `useResolvedDark()`：POS badge 等 JS 分支用
- 首屏：`index.html` 内联脚本处理 `appearance` / 旧 `darkMode` + system

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
// 负责：调用 AI API，管理 AbortController + generation gate，写入 cache
// 导出：

export function useAiLookup() {
  // trigger(word, meanings) — 标准 AI 分析（词库有结果时）
  // triggerFullLookup(word) — AI 全量查词（词库无结果时）；30s 超时 → setAiError
  // triggerPhraseQuery(phrase) — AI 词组/句子查询
  // repairCollocationNotes / repairConceptExamples — 只补缺失释义
  // cancelAi() — Instant 切回时 abort + 作废 generation，防止迟到写入
  // 主请求共享 AbortController，互斥执行；超时与用户取消经 classifyAiRequestError 区分

  return {
    trigger, triggerFullLookup, triggerPhraseQuery,
    repairCollocationNotes, repairConceptExamples, cancelAi,
  }
}
```

相关纯函数（可单测）：`utils/abortSignal.ts`、`aiRequestErrors.ts`、`aiRequestGate.ts`、`historyTrack.ts`、`resultAiVisibility.ts`。

### useComposerFlowLayout

```ts
// src/hooks/useComposerFlowLayout.ts
// 负责：SearchBar 输入框的多行排版 —— 文字满宽、右下角按钮只遮最后一行

export function useComposerFlowLayout(value, { gap, maxHeight, collapsed }) {
  // 用隐藏镜像 div（复制 textarea 的字体 / 内边距 / 内容宽度）测量：
  //   1. 文字总高度 → textarea 高度
  //   2. 末尾零宽标记的 x 坐标 → 最后一行末尾是否顶到按钮
  // collides → reserveHeight 撑出一行空白供按钮占位；文字继续在上方满宽流动
  // 下沉量由实测几何推导（按钮胶囊比行高高出多少就沉多少），按钮改尺寸自动适配
  // collapsed（失焦）且内容多行 → 只把可视高度压回一行、scrollTop 归零、圆角回胶囊，
  //   value 完全不动；重新聚焦时 effect 以 collapsed=false 重跑，版式原样恢复

  return { textareaRef, mirrorRef, actionsRef, containerRef, reserveHeight, isMultiLine, isCollapsed }
}
```

**SearchBar 折叠交互**：`collapsed: !isFocused`。失焦（blur 后 200ms，让点击建议项不误触）→ 收成一行；
再次聚焦 → 展开，光标落到**文本末尾**并滚到底（长文不再 `select()`，避免一个按键清空全文）；
单行短查询仍保持原来的 `select()` 全选。光标定位放在 `useLayoutEffect` 里（声明在本 hook 之后），
必须等 hook 先把高度撑回去，否则 scrollTop 会被随后的高度变更重置。

**硬约束（勿违反）**：

- textarea 宽度**必须恒定**（满宽），按钮用 `absolute` 脱离文档流。一旦让「是否换行」去改变 textarea 宽度，就会形成**布局反馈环**：换行 → 变宽 → 不需换行 → 变窄 → 又需换行，每敲一个字符抖一次，严重时 React `Maximum update depth exceeded` 崩溃。
- **不要数字符**判断换行，字符非等宽；一切阈值运行时按像素实测，随屏宽 / 字体自适应。
- 若必须临时钉住 textarea 宽度做测量，`flex-1` 的 `flex-basis: 0` 会让 inline `width` 失效，须同时设 `flex: none`。

### useComposerAutoGrow

```ts
// src/hooks/useComposerAutoGrow.ts
// 负责：AiChatBox 输入框的高度自适应（Send 按钮本就在框外，无需绕行逻辑）
// isMultiLine 仅用于圆角切换，不得反馈到宽度

export function useComposerAutoGrow(value, { maxHeight }) {
  return { textareaRef, isMultiLine }
}
```

相关纯函数（可单测）：`utils/composerAutoGrow.ts`（`singleLineHeight` / `wrapsToMultipleLines`）。

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

用户在 AiChatBox 提问（props: context + cognitive）
  → askQuestion(context, history) [1-3s]
  → 回答写入 chatStore[cognitiveCacheKey]（Lookup / Core 分轨，persist）
  → 成功后双写 user_word_memory.ai_conversations_json 对应桶 + Profile chat 事件
```

