# CHANGELOG

## 2026-04-09 — Phase 2 & 5：跨平台打包（Tauri PC + Capacitor Android）

### 新增

- **Tauri 桌面打包**（Phase 2）
  - `src-tauri/` 目录：`Cargo.toml`、`tauri.conf.json`、`lib.rs`、`main.rs`、`build.rs`
  - 应用窗口 420×720，可调整大小，最小 360×600
  - `capabilities/default.json`：Tauri v2 权限配置
  - 生成占位图标（蓝色方块，后续可替换）
  - 输出：`Lexicon_0.1.0_x64-setup.exe`（NSIS）+ `Lexicon_0.1.0_x64_en-US.msi`

- **Capacitor Android 打包**（Phase 5）
  - `capacitor.config.ts`：appId `com.julian.lexicon`，webDir `dist`
  - `android/` 目录：Gradle 项目，词库自动复制到 assets
  - 输出：`app-debug.apk`（19MB）

- **平台检测工具**：`src/services/platform.ts`（`isTauri()` / `isCapacitor()` / `isWeb()`）

- **Vite 配置优化**：Tauri 模式下跳过 COOP/COEP headers（避免 WebView2 兼容问题），忽略 `src-tauri/` 文件监控

### package.json 变更

- 新增 scripts：`tauri:dev`、`tauri:build`
- 新增 dependencies：`@capacitor/core`、`@capacitor/cli`、`@capacitor/android`
- 新增 devDependencies：`@tauri-apps/cli`、`@tauri-apps/api`

### TS 修复

- `useAiLookup.ts`：移除未使用的 `QueryType` import
- `useSearch.ts`：移除未使用的 `setAiStatus`/`setAiFullResult`/`setPhraseResult` 解构
- `ai.ts`：修复 `aiPhraseQuery` 返回值中 `correctForm` 重复赋值

---

## 2026-04-08 — Phase 3：图片嵌字（Canvas 去原文 + 贴译文）

### 新增

- **嵌字预览模式**：翻译完成后可切换「翻译列表」/「嵌字预览」
- **Canvas 图片编辑器**（`ImageEditor`）：按文字类型分策略渲染
  - `bubble`（对话框）：采样背景色填充 + 渲染译文
  - `sfx`（音效）：不覆盖背景，描边文字叠加（白色描边 + 深色填充）
  - `caption`（标注）：半透明圆角背景条 + 译文
- **AI 自动分类文字类型**：prompt 要求返回 `type: "bubble" | "sfx" | "caption"`，bbox 严格贴合文字区域
- **可爱字体支持**：Google Fonts 引入快乐体（圆润可爱）、马善政（毛笔手写）、龙藏（硬笔手写），可在 UI 切换
- **导出按钮**（`ExportButton`）：canvas.toBlob() 导出合成后的 PNG 图片
- 翻译列表显示文字类型标签（对话/音效/标注），颜色区分

### 新增组件

- `ImageTranslate/ImageEditor.tsx`：Canvas 嵌字渲染器（forwardRef + useImperativeHandle 暴露 exportBlob）
- `ImageTranslate/ExportButton.tsx`：导出合成图片

### 新增类型

- `TextBlockType`：`'bubble' | 'sfx' | 'caption'`（TextBlock 新增 type 字段）

---

## 2026-04-08 — Phase 1：图片上传 + AI 翻译

### 新增

- **图片翻译视图**（`ImageTranslateView`）：上传/拖拽图片 → AI Vision API 检测文字 → 返回翻译列表
- **语言选择**：源语言（自动检测/日语/英语/韩语/法语）→ 目标语言（中文/英语/日语）
- **翻译结果可编辑**：每条译文支持手动修改（为 Phase 3 嵌字功能准备）
- **App 顶部 Tab 切换**：「查词」/「图片翻译」两个视图

### 新增组件

- `ImageTranslate/index.tsx`：图片上传 + 翻译主视图
- `ImageTranslate/TranslationList.tsx`：翻译结果列表（可编辑译文）

### 新增 Store

- `imageStore.ts`：图片翻译状态管理（图片、语言、翻译块、加载状态）

### 新增类型

- `TextBlock`：文字块（原文 + 译文 + 归一化 bbox 坐标）
- `ImageTranslation`：图片翻译结果

### 新增 AI 函数

- `aiImageTranslate()`：Vision API 图片文字检测+翻译，返回 TextBlock[]

---

## 2026-04-08 — 搜索增强 + AI 兜底查询 + 词组/句子支持 + AI 问答框

### 新增

- **搜索建议支持词组**：输入含空格时匹配词组条目（前缀 + 模糊双路合并去重）
- **QueryType 识别**：自动判断输入为 `word`/`phrase`/`sentence`（含标点或 ≥5 词→sentence，含空格→phrase）
- **AI 兜底查词**（`aiFullLookup`）：词库无结果时自动切 AI mode，AI 生成完整单词信息（音标、词性、释义+场景、词源、近义词、例句），带「AI 查询」标签
- **AI 词组/句子查询**（`aiPhraseQuery`）：词组/句子走 AI 生成（释义、使用场景、例句、练习），带「AI 查询 · 词组/句子」标签
- **AI 问答框**（`AiChatBox`）：支持多轮对话，以当前单词/词组为上下文提问，加在 AI mode 末尾和所有 AI 视图末尾
- **拼写纠正展示**：AI 返回 `correctForm`，大字显示正确拼写，用户输入有误时小字标注原始输入（红色删除线）

### 新增组件

- `AiFullView`：AI 全量单词视图，复用 WordHeader、SemanticScene、EtymologyCard、SynonymList、PracticeSection
- `PhraseView`：词组/句子视图（释义→使用场景→例句→练习→问答）
- `PhraseExercises`：词组练习组件（评分复用 `evaluateAnswer`）
- `AiChatBox`：AI 问答框组件

### 新增类型

- `QueryType = 'word' | 'phrase' | 'sentence'`
- `AiFullResult`（含 `correctForm`）、`PhraseResult`（含 `correctForm`）、`ChatMessage`

### 新增 AI 服务函数

- `aiFullLookup(word, signal?)`：词库缺失单词的全量 AI 生成
- `aiPhraseQuery(phrase, signal?)`：词组/句子 AI 查询
- `askQuestion(context, history, signal?)`：AI 问答，支持多轮对话历史

### 修改

- `searchStore` 新增 `queryType` 状态，`setQuery` 时自动推断类型
- `resultStore` 新增 `aiFullResult`、`phraseResult`、`chatMessages` 状态及对应缓存
- `db.web.ts` 的 `suggest()` 改为按输入是否含空格分支：单词模式 / 词组模式
- `useSearch` hook 改造：按 queryType 分支处理，词库无结果时自动切 AI mode
- `useAiLookup` hook 新增 `triggerFullLookup` 和 `triggerPhraseQuery`
- `App.tsx` 按 wordResult / aiFullResult / phraseResult 三路条件渲染对应视图
- `AiSection/index.tsx` 末尾新增 `AiChatBox`

---

## 2026-04-07 — 练习评分严格化

### 改进

- **`EVAL_SYSTEM_PROMPT`**（`src/services/ai.ts`）评分规则收紧：
  - 原规则"in spirit 正确即通过"改为"意思 + 语法同时正确才标 correct"
  - 明确不可忽略的错误类型：动词搭配错误（如 `dangerous playing` → `dangerous to play`）、错误时态、主谓一致、句子结构不正确、影响意义的冠词缺失
  - 明确可忽略的范围：仅限次要词的小拼写错、大小写、标点
  - feedback 要求指出具体违反的语法规则（中文）

---

## 2026-04-07 — AI 配置体验 + 稳定性修复

### Settings 大改：AI 服务商选择

- **`SettingsDrawer`** 新增服务商选择网格（15 个预设 + 自定义）：
  OpenAI · Google Gemini · Anthropic · OpenRouter · DeepSeek · Mistral · Groq · Together AI · xAI/Grok · Perplexity · Moonshot/Kimi · SiliconFlow · 智谱 GLM · 零一万物 · 自定义
  - 点击服务商 → Endpoint 自动填入，选中态高亮；手动编辑 Endpoint → 自动切为"自定义"
  - "获取模型列表"按钮：`GET {endpoint}/models`，返回可点击模型列表（点击直接填入）
  - 获取失败时，有预置静态模型的服务商（Gemini / Anthropic / DeepSeek / xAI / Perplexity / Moonshot）显示"查看常用列表"兜底
  - 当前选中模型在列表中高亮
- **"测试连接"按钮**：发送极简请求（max_tokens=10）验证 endpoint + API key + 模型三项是否可用
  - 成功：绿色 ✓ 连接成功 / 失败：红色 ✗ + 具体原因（401 key 无效 / 404 模型不存在 / 429 超频）
  - 切换服务商时自动重置测试状态

### 每服务商独立存储 API Key

- `settingsStore` 将 `aiApiKey: string` 改为 `aiApiKeys: Record<string, string>`（以 providerId 为 key）
- 切换服务商时自动读取对应的 key，互不覆盖
- API Key 输入框右上角显示"已保存"绿色标记
- 新增 `setApiKeyForProvider(providerId, key)` 替代原 `setAiApiKey`

### 修复 `getConfig()` 严重 bug

- 原 `getConfig()` 读 `localStorage.getItem('ai_endpoint')` 等独立 key，但 Zustand persist 存在 `lexicon-settings` 下，实际永远读不到——Settings 页填的配置从未生效
- 修复为正确解析 `localStorage.getItem('lexicon-settings')` → 读取 `state.aiEndpoint`、`state.aiModel`、`state.aiApiKeys[state.aiProvider]`

### AI 板块暗黑模式修复

- `SemanticScene`、`EtymologyCard`、`SynonymList`、`AiStatusBar`、`PracticeSection` 全部 inline style（`#7F77DD` / `#3C3489` / `#EEEDFE`）替换为 Tailwind class
- 暗色模式下自动切换为 `indigo-900/20`（背景）、`indigo-300`（文字）等适配色
- `SkeletonBlock` loading 骨架加 `dark:bg-gray-800` 适配

### AI JSON 解析稳定性

- `callApi` 代码块剥离从简单正则改为 `fenceMatch`（捕获两个 ` ``` ` 之间的内容），兼容模型在 JSON 前加说明文字的情况
- `generateExercises` / `evaluateAnswer` / `analyzeWord` 均加两级兜底：① 直接 parse → ② 正则提取第一个 `[...]` 或 `{...}` 再 parse
- 移除所有 `max_tokens` 硬限制（改用 prompt 控制长度），防止 JSON 写到一半被截断
- 主分析 prompt 新增 "Keep the entire response concise and compact" 等长度约束规则

---

## 2026-04-07 — AI Mode 学习体验增强

### 新增

- **派生词（Etymology 板块）**：`EtymologyCard` 在 story 段落下方新增派生词列表（word / pos / meaning），展示由主词派生的词族（如 satisfy → satisfaction / satisfactory / dissatisfy）
  - `Etymology` 类型新增 `derivedWords: DerivedWord[]` 字段
  - AI system prompt 更新，要求返回 3-6 个派生词

- **课后练习板块**（`PracticeSection`）：AI mode 底部新增练习区域
  - 默认显示"生成练习"按钮（不自动触发，避免用户没空做时浪费 token）
  - 点击后调用 `generateExercises()` 生成场景题（AI 优先选最常用义项场景）
  - 每题独立提交，提交后调用 `evaluateAnswer()` 实时评分
  - 答对：绿色 ✓ 不错！/ 答错：中文错误说明 + 参考句，可重新作答

- **练习题数设置**：`settingsStore` 新增 `maxExercises: number`（默认 5，范围 1-10），`SettingsDrawer` 新增 +/- 控件

### 新增类型（src/types/index.ts）

- `DerivedWord`: `{ word, pos, meaning }`
- `Exercise`: `{ scenario }`
- `EvaluationResult`: `{ correct, feedback, correction }`

### 新增 AI 服务函数（src/services/ai.ts）

- `generateExercises(word, meanings, count, signal?)` — 独立 AI 调用，返回 `Exercise[]`
- `evaluateAnswer(word, scenario, userAnswer, signal?)` — 独立 AI 调用，返回 `EvaluationResult`
- 内部提取公共 `callApi()` 工具函数减少重复代码

### 新增组件

- `src/components/ResultView/AiSection/PracticeSection.tsx`

### 接口变更

- `AiSection` props 新增 `word: string` 和 `meanings: Meaning[]`（由 `ResultView` 传入）
- `SettingsStore` 新增 `maxExercises` + `setMaxExercises`

---

## 2026-04-07 — 历史记录功能

### 新增

- **`src/stores/historyStore.ts`**：Zustand + persist，历史词汇存 localStorage（`lexicon-history`），最多保留 100 条，支持 `add`/`remove`/`clear`
  - 注：放弃 SQLite 写入方案（sql.js 为内存 DB，刷新即丢失）

- **`src/components/SearchBar/HistoryList.tsx`**：历史列表组件
  - 搜索框聚焦且输入为空时出现（dropdown 形式，与 SuggestList 互斥）
  - 顶部"最近查词"标题 + "清除全部"按钮
  - 每条记录可点击查词，hover 显示单条删除按钮

- **`src/hooks/useSearch.ts`**：`selectWord` 查词成功后调用 `historyStore.add(word)`，受 `historyEnabled` 控制

- **`src/components/SearchBar/index.tsx`**：新增 `isFocused` 状态，控制 HistoryList 显示逻辑；`onBlur` 用 150ms 延迟避免点击历史项时列表消失

### 滚动条样式（上一次遗漏记录）

- `src/index.css`：添加全局 webkit scrollbar 样式，亮色 gray-300/暗色 gray-600，宽 6px，透明轨道

---

## 2026-04-07 — 体验优化

### 新增/改进

- **键盘导航**（SearchBar + SuggestList）：
  - `↑` / `↓` 方向键在补全列表中移动高亮
  - `Enter` 选中高亮项（无高亮时沿用原逻辑：取第一条或原始输入）
  - `Escape` 关闭补全列表（再按一次清空搜索框）
  - 活动项自动 `scrollIntoView`，长列表不出界

- **搜索框 focus ring**：输入框获得焦点时显示 indigo 色边框 + 光晕（`focus-within`）

- **WordHeader 词性 badge 暗黑适配**：读取 `settingsStore.darkMode`，动态切换 `badgeBg`/`badgeText`，修复 CLAUDE.md 中记录的 known issue

- **ModeToggle 暗黑适配**：非激活按钮补充 `dark:` 系列 Tailwind 类

- **AI mode 切换自动触发**（App.tsx）：从 Instant 切换到 AI mode 时，若当前有词结果且 `aiStatus === 'idle'`，自动触发 `triggerAi`；用 `prevModeRef` 防止初始渲染误触发

---

## 2026-04-07 — 项目初始化完成（Step 1-11）

### 完成内容

- **Step 1-2**：手动创建 Vite React-TS 项目结构（create-vite 不支持非交互式运行，直接写文件）
  - 安装：react 18、react-dom、zustand、sql.js、tailwindcss、@tailwindcss/vite、@types/sql.js
  - 注意：安装的是 Tailwind **v4**（非 v3），配置方式为 CSS `@import "tailwindcss"` + `@theme` block

- **Step 3**：配置 vite.config.ts（含 COOP/COEP headers for sql.js WASM）
  - 复制 sql-wasm.wasm 到 public/sql-wasm/

- **Step 4**：Tailwind v4 配置
  - 颜色 token（ai-bg/ai-text/ai-dot）通过 src/index.css `@theme` 定义

- **Step 5**：创建目录结构
  - src/components/{SearchBar,SuggestList,ResultView/{InstantSection,AiSection},Settings}
  - src/{services,stores,hooks,types}，scripts/

- **Step 6**：src/types/index.ts — 全部全局类型（Mode, SuggestItem, Meaning, Scene, Etymology, Synonym, Example, WordResult, AiAnalysis）

- **Step 7**：Zustand stores
  - searchStore（query, suggestions, mode）
  - resultStore（wordResult, aiAnalysis, aiStatus, aiCache）
  - settingsStore（aiEndpoint, aiModel, aiApiKey, historyEnabled，persist 到 localStorage）

- **Step 8**：服务层
  - db.ts — DBService 接口 + 平台选择入口
  - db.web.ts — sql.js 实现，词库未就绪时自动 fallback 到 mock 数据
  - ai.ts — 完整 system prompt + OpenAI-compatible API 调用 + AbortSignal 支持

- **Step 9**：Hooks
  - useSearch.ts — 300ms debounce 补全 + selectWord
  - useAiLookup.ts — AbortController 取消 + session cache

- **Step 10**：全部组件
  - WordHeader, MeaningList, ExampleList
  - SemanticScene, EtymologyCard, SynonymList, AiStatusBar/SkeletonBlock
  - InstantSection, AiSection, ResultView
  - SuggestList, ModeToggle, SearchBar
  - SettingsDrawer, App

- **Step 11**：TypeScript 零报错，vite build 成功（207KB JS + 15KB CSS）

---

## 2026-04-07 — Step 12：词库导入完成

### 完成内容

- **白屏修复**：`db.web.ts` 改用动态 `import('sql.js')` 避免 CJS 静态导入兼容问题
- **Step 12**：编写并执行 `scripts/mdx-to-sqlite.mjs`
  - 来源：牛津高阶英汉双解词典（第9版）OALD9.mdx（52MB）
  - 修复 js-mdict 读取该 MDX 时的 surrogate 编码问题（fixSurrogates 函数）
  - 解析 OALD9 自定义 HTML 标签（sn-g, def, chn, x-g-blk）
  - 输出：`public/lexicon.db`（31MB）
    - 52,861 词条，99,359 释义，67,683 例句，51,899 suggest 条目
  - 用时：32.7 秒，0 错误

### 注意

- `cigen_en_new.eudic`（词根词缀词典）为 Eudic 私有格式，无法解析，跳过；词源信息由 AI mode 在线生成
- 柯林斯 COBUILD MDX 暂未导入（当前词库质量已满足需求）
- `scripts/mdx-to-sqlite.mjs` 为一次性脚本，生成的 `public/lexicon.db` 提交到 git

---

## 2026-04-07 — sql.js 加载修复 + UI 功能迭代

### Bug 修复

- **sql.js 无法加载（词库实际未工作）**：
  - 根因：`optimizeDeps: { exclude: ['sql.js'] }` 阻止 Vite 做 CJS→ESM 转换，浏览器无法 import CJS 模块，所有查词 fallback 到 mock 数据
  - 修复：移除 `optimizeDeps.exclude`，让 Vite 预打包 sql.js（sql-wasm-browser.js 不内嵌 WASM，esbuild 可处理）
  - 同步：补充复制 `sql-wasm-browser.wasm` 到 `public/sql-wasm/`（浏览器 variant 需要）
  - `db.web.ts` 恢复静态 `import initSqlJs from 'sql.js'`

### 新增功能

- **Enter 键直接查词**（SearchBar）：优先取第一条补全结果，否则查输入的原词

- **Suggest 列表优化**：
  - SQL 过滤掉含空格的短语条目（`word NOT LIKE '% %'`），只显示单词
  - 排序改为 `length(word), word`（短词优先）
  - 最多返回 20 条，列表可滚动（`max-h-72 overflow-y-auto`）

- **相关词组板块**（词条结果页）：
  - `DBService` 新增 `getRelatedPhrases(word)` 方法
  - 查询以该词开头的短语条目（如 make → "make a point of sth" 等）
  - `resultStore` 新增 `relatedPhrases` 字段
  - `useSearch.selectWord` 用 `Promise.all` 并行查词条 + 短语
  - 新增 `PhrasesSection` 组件，展示在例句之前；超过 6 条折叠

- **义项/例句折叠**：
  - `MeaningList`：超过 4 条义项折叠，底部"展开更多 (N)"
  - `ExampleList`：超过 3 条例句折叠

- **深色模式**：
  - Tailwind v4 改为 class-based dark mode（`@variant dark (&:where(.dark, .dark *))`）
  - `settingsStore` 新增 `darkMode: boolean`（persist 到 localStorage）
  - App.tsx 用 `useEffect` 同步 `darkMode` → `document.documentElement.classList`
  - SettingsDrawer 新增"深色模式"开关
  - 所有组件添加 `dark:` Tailwind 类

### Store 接口变更

- `ResultStore`：新增 `relatedPhrases: SuggestItem[]`、`setRelatedPhrases`
- `SettingsStore`：新增 `darkMode: boolean`、`setDarkMode`
- `DBService`：新增 `getRelatedPhrases(word, limit?): Promise<SuggestItem[]>`

### 新增组件

- `src/components/ResultView/InstantSection/PhrasesSection.tsx`
