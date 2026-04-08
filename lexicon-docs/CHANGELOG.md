# CHANGELOG

格式：每次架构改动或功能完成后在顶部追加，不删除历史记录。

---

## [2026-04-08]

### 新增
- `QueryType` 类型（`word` / `phrase` / `sentence`），searchStore 新增 `queryType` 状态
- `AiFullResult` / `PhraseResult` / `ChatMessage` 类型
- `aiFullLookup()` / `aiPhraseQuery()` / `askQuestion()` AI 服务函数
- `AiFullView` 组件：AI 全量单词视图（词库缺失时兜底）
- `PhraseView` 组件：词组/句子 AI 视图
- `PhraseExercises` 组件：词组练习
- `AiChatBox` 组件：AI 问答框（多轮对话）

### 修改
- `db.web.ts` suggest() 支持词组模糊匹配（含空格时切换查询策略）
- `resultStore` 新增 `aiFullResult` / `phraseResult` / `chatMessages` + 对应缓存
- `useSearch` 按 queryType 分支，词库无结果自动切 AI mode
- `useAiLookup` 新增 `triggerFullLookup` / `triggerPhraseQuery`
- `App.tsx` 三路条件渲染（ResultView / AiFullView / PhraseView）
- `AiSection` 末尾新增 AiChatBox
- AI prompt 新增 `correctForm` 字段，视图展示正确拼写 + 标注用户原始输入

### 同步更新的文档
- `CHANGELOG.md`、`04-ai-schema.md`、`05-components.md`、`CLAUDE.md`

---

## [2026-04-07]

### 新增
- `PhrasesSection` 组件：展示以当词开头的相关词组，支持点击直接查词，超过 6 条折叠
- `HistoryList` 组件：搜索框聚焦时展示最近查词记录，支持单条删除 + 清除全部
- `historyStore`（Zustand + persist）：本地持久化历史记录，最多保留 100 条
- `PracticeSection` 组件：AI 按需生成练习场景，每题独立评分
- `generateExercises` / `evaluateAnswer` / `testConnection` AI 服务函数
- Settings 抽屉新增：服务商选择（14 家预设）、模型列表获取、练习题数设置
- 暗黑模式：`settingsStore` 新增 `darkMode`，WordHeader badge 增加深色颜色变体

### 修改
- `settingsStore` 重构：新增 `aiProvider`、`aiApiKeys`（按服务商存储）、`maxExercises`
- `resultStore` 新增 `relatedPhrases` / `setRelatedPhrases`
- `DBService` 接口新增 `getRelatedPhrases` 方法，`db.web.ts` 同步实现
- `MeaningList`、`ExampleList` 支持超出阈值折叠
- `ai.ts` 新增 `derivedWords` 字段到 Etymology，JSON 解析增加 fallback（regex 兜底）

### 架构变更
- `historyStore` 完全在 localStorage 持久化（不写 SQLite），与 `DBService.addHistory` 解耦；后者仍保留但仅供后续跨平台实现使用

### 同步更新的文档
- 本次补录所有文档（因开发期间未实时更新）

---

## [2026-04-06 及之前] — 初始开发 Steps 1–12

### 新增
- 项目初始化：React 18 + TypeScript strict + Vite 5 + Tailwind v4
- 全局类型定义（`src/types/index.ts`）
- Zustand stores：`searchStore`、`resultStore`、`settingsStore`
- 服务层：`db.ts`（DBService 抽象接口）+ `db.web.ts`（sql.js Web 实现）+ `ai.ts`（analyzeWord）
- 自定义 Hook：`useSearch`（debounce + 查词）、`useAiLookup`（AI 调用 + AbortController + 缓存）
- 所有核心组件：`SearchBar`、`ModeToggle`、`SuggestList`、`ResultView`、`WordHeader`、`InstantSection`、`AiSection`、`SemanticScene`、`EtymologyCard`、`SynonymList`、`AiStatusBar`、`SkeletonBlock`、`SettingsDrawer`
- 词库导入：OALD9 MDX → SQLite，52k 词条，`public/lexicon.db`（31MB）
- `suggest` 表区分单词与词组（含空格过滤）

### 同步更新的文档
- `lexicon-docs/` 全套设计文档（01–06）初始版本

---

## [Unreleased]

### 初始化
- 项目文档设计完成（lexicon-docs/）
- 待开始实现

---

<!-- 模板：每次改动复制下面这个块到顶部 -->
<!--
## [日期 YYYY-MM-DD]

### 新增
- 

### 修改
- 

### 修复
- 

### 架构变更
- （在这里说明为什么改，不只是改了什么）

### 同步更新的文档
- 
-->
