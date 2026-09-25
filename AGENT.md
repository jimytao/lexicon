# AGENT.md — Lexicon 项目（AI Agent 启动上下文）

> **本文件是所有 AI Agent（Cursor / Claude Code / Codex / 其他）的统一项目上下文。**
> 会话开始时请先读本文件；涉及具体子系统时再按下方索引打开 `lexicon-docs/`。
>
> **修改架构、导航、模式、存储层或跨平台约定后，必须同步更新本文件**，否则后续会话会基于过期信息工作。
>
> 兼容入口：根目录 `CLAUDE.md` 仅指向本文件（供仍自动加载 `CLAUDE.md` 的工具使用）。权威内容以 **本文件** 为准。

---

## 项目简介

**Lexicon** — 以中文母语学习者为起点，并支持英越 / 英英词典身份的英语学习工具。
开发者：Julian（中文母语，英语学习者）

核心理念：不只是翻译，而是真正理解词的语义情景、情感质感、词源脉络。

当前版本：**v0.9.20**（以 `package.json` / `src/stores/updateStore.ts` 为准）。

---

## 如何使用本文档（给 Agent）

1. **先读本文件**，建立全局约束与现状。
2. **遇到架构/UI/DB/AI/跨平台问题 → 先查 `lexicon-docs/`，再改代码**。
3. **发版** → 严格按根目录 `workflow.md`。
4. **初始化脚手架历史步骤**（已完成，勿重复执行）→ `lexicon-docs/CC-INSTRUCTIONS.md` 仅作档案与少量持续指令参考。
5. 回复用户默认使用**中文**（除非用户要求其他语言）。

---

## 设计文档索引

所有架构决策在 `lexicon-docs/`。**先查文档再动代码。**

| 文档 | 读取时机 |
|------|----------|
| `lexicon-docs/01-architecture.md` | 技术栈、目录结构、全局类型 |
| `lexicon-docs/02-ui-design.md` | UI / 交互、查词模式与结果页 |
| `lexicon-docs/03-database.md` | 词库、SQLite、存储层 |
| `lexicon-docs/04-ai-schema.md` | AI 调用、prompt、JSON schema |
| `lexicon-docs/05-components.md` | 组件树、store、hook |
| `lexicon-docs/06-crossplatform.md` | Capacitor / Tauri |
| `lexicon-docs/07-cognitive-and-settings-architecture.md` | 深度认知、Mode 3 (Pure Core)、设置架构 |
| `lexicon-docs/08-ai-learning-system-and-profile.md` | User Profile、Lexicon Memory |
| `lexicon-docs/09-ui-ux-design-system.md` | UI/UX 规范、间距、反模式（**改 UI 必读**） |
| `lexicon-docs/10-browser-extension.md` | 浏览器扩展（MV3）：**P0–P4 已完成，待 Chromium 人工验收与商店提交**（动扩展相关代码前必读） |
| `lexicon-docs/README.md` | docs 目录总览 |
| `workflow.md`（根目录） | 发版 SOP（版本号、Release Notes、打包） |

### 扩展开发专用 skill（按需启用）

做**浏览器扩展相关工作**（`10-browser-extension.md` 的 P0 及之后）时，本项目需装 Anthropic 的
**Chrome Extensions and Chrome Web Store** skill —— 提供 MV3 API 与商店上架的最新规范。

- **按需启用**：只在动扩展代码时打开，平时不必常驻，避免污染常规查词功能的上下文
- 未做扩展工作的会话**不需要**它

---

## 当前技术栈

```
React 18 + TypeScript（strict）
Vite 5
Tailwind CSS v4（配置在 src/index.css，@variant dark 为 class-based）
Zustand（状态管理 + 部分 persist）
sql.js（本地 SQLite，WASM；全平台当前仍用此实现）
Tesseract.js（WASM OCR，嵌字/图片模式文字定位）
Capacitor 8（Android / iOS）
Tauri 2（PC: Windows 本地构建 / macOS GitHub Actions 云端构建）
```

目标平台：Web → Android（Capacitor）→ iOS（Capacitor / Actions）→ PC（Tauri: Windows / macOS）→ 浏览器扩展（MV3 / Chromium，**P0–P4 已完成，`npm run build:ext` → `dist-ext/`；词库远程下载+OPFS，网络走 SW 代理绕 CORS，网页选词经 pendingQuery 交侧栏**；见 `10-browser-extension.md`）
**产品阶段**：多端已可构建；功能迭代以 Web 为开发基准。

---

## 产品与导航现状（重要）

### 底栏导航（3 Tab）

`AppView = 'dictionary' | 'translate' | 'settings'`

| Tab | 文案 key | 说明 |
|-----|----------|------|
| Dict | `nav.dict` | 查词主流程 |
| Image | `nav.image` | 嵌字 / 图片模式（内部 view 名仍为 `translate`） |
| Settings | `nav.settings` | **全页设置**（不是抽屉） |

### 雪藏 UI（不要擅自恢复）

- `MemoryView`、`AILearningDigestCard`：**源码保留，不挂载进 `App.tsx`**
- `UserNoteEditor`：**源码保留，不挂载进结果页**
- **禁止**重新加 Memory Tab、首页弱项看板或笔记编辑面板，除非用户明确要求解封
- Settings 内 `ProfileModal` 与 Profile / `user_word_memory` **后端仍可用**

### 查词三种模式

| 模式 | store 值 | 品牌名（UI 保留英文） | 行为摘要 |
|------|----------|----------------------|----------|
| Instant | `instant` | Instant | 纯本地词库，零延迟，离线可用 |
| AI Lookup | `ai` | AI Lookup | L1 立即渲染；AI 增量板块 skeleton → 淡入 |
| Pure Core | `core` | Pure Core | 单词：深度认知全量视图；词组/句子：母语者心智分轨（见下表） |

- 默认模式：`settingsStore.defaultSearchMode`（`instant` \| `ai` \| `core`）
- 模式切换应**点击即生效**（Lookup / Pure Core 均有缓存恢复或立刻触发；勿仅依赖可能不同步的 `useEffect`）
- 同一次查询内三种模式各自保存外层 `scrollTop`；未访问模式从顶部开始，新查询 / 历史词条跳转 / 强制 AI 时清空三份位置。恢复必须在模式视图提交后的 `useLayoutEffect` 中完成，禁止用平滑滚动穿过旧内容。
- **切回 Instant**：`cancelAi()`（abort + generation 作废）→ 有本地快照则只显示 L1（卸下 AI 展示含 Chat，缓存保留）；无本地 → `searchSource=none` 清空结果区，保留搜索框
- **空态**：无查询且无结果时，任意默认模式都显示小书引导（`showEmptyHome`），禁止 Core 空壳抢首页
- 在 **Core** 下命中全量缓存时，**禁止**强制切回 `ai`
- **Instant 词库命中**：纯 L1；切到 Lookup/Core 时保持 L1，再触发 combined（标签翻页不重打）
- **Lookup / Pure Core 普通搜索 + 词库命中**：同一流水线——先出本地 L1，再 `triggerCombinedLookup`（Lookup→Core 双半）；**禁止**把普通搜改成 `ai-full` 旁路词库
- **强制 AI（⭐）**：旁路词库的全量路径（`ai-full` / phrase），文案须与「普通搜 = 词典+合并增量」区分
- **Instant 词库未命中**（或强制 AI）：按 `defaultSearchMode` 落入 Lookup 或 Core（默认仍是 Instant 时 → Lookup）
- **历史双轨**：`lookupAiMode` / `coreAiMode`；历史列表双星（Lookup 琥珀 / Core 靛色）；`historyPreferCognitive`（默认 lookup）决定双轨皆有时的回放优先；**双轨皆无** → 有词库则留 Instant，OOD/词组仍落入 preferred AI
- **AI 超时**：fetch Abort + Timeout reason 须映射为可展示 error（禁止当静默 Abort 卡住 loading）
- **释义补全**：全量结果缺 note/meaning 时静默重试一次；仍缺则板块「补全缺失释义」只补缺项

### 结果渲染路径

`App.tsx` 按结果条件渲染：

- `ResultView` — 词库 L1 + AI 增量（Instant / AI Lookup）
- `AiFullView` — AI 全量单词结果
- `CoreCognitiveView` — Pure Core
- `PhraseView` — 词组 / 句子

`resultStore` 三路结果 + 缓存：

- `wordResult`（词库）
- `aiFullResult` + `aiFullCache`（Lookup / Pure Core **分轨**：`q` vs `q::core`）
- `phraseResult` + `phraseCache`（同上分轨）
- 另有增量 `aiAnalysis` + `aiCache`

历史约 100 条；AI 追问（chat）缓存 key 使用 `cognitiveCacheKey`（Lookup=`q`，Pure Core=`q::core`），与 AI 结果缓存分轨一致；词面仍用 `normalizeQuery`。

### 信息渲染顺序（出厂默认；设置可拖拽覆盖）

**AI Lookup（理解与记忆）**
释义 → 轻量 coreConcept → 词根 → 助记 → 例句 → 相关词组 → 介词意象 → **释义核对练习** → Chat

**Pure Core（母语者用法）**
加厚 coreConcept（含 **gloss 短对译** + feelAnchor / emotionalTone）→ 概念树 → **常用介词词组 (`chunks`)** → **其他常用词组 (`collocations`)** → 近义选用（`whenToUse` 含适用心智 / 为何仍选主词）→ 用法场景 → 语域 → **场景造句练习** → Chat
（以上模组均可在设置中拖拽/开关；旧 `wordChoice` / `nativeMindModel` 仅作缓存兼容。**搭配规则 C**：innit 类尾缀若只会重复概念树句架，AI 可返回空搭配，UI 不展示空卡；实词仍正常出搭配。）

### Lookup vs Pure Core 认知分轨

| | AI Lookup | Pure Core |
|--|-----------|-----------|
| **角色** | 学会意思、怎么记住 | 母语者怎么想、怎么用 |
| **单词全量** | 释义墙 + 轻量意象 + 词源/助记；无概念树/搭配墙 | 加厚用法意象（gloss+感觉锚+情绪底色）+ 概念树 + 介词语组/其他词组 + 近义（含适用心智）；**无 dictionary / 无独立选用对照** |
| **词组/句子** | 短释义 + `usageIntro`/场景、例句、介词意象、释义核对；`modules`（短词组勿把情景长文塞进 meaning） | 释义轻量固定展示（可附感觉/情绪）；**`corePhraseModules`**（`usageIntro`+用法场景/选用对照/语域/造句练习） |
| **练习** | `meaning-check`（输入大致意思） | `usage-output`（场景造句） |
| **prompt 模组源** | `settings.modules` | 单词 `coreModules`；词组/句 `corePhraseModules` |
| **中文反查 Core** | — | 短英文候选（非 dictionary 墙）+ 心智主线 |
| 缓存 | `aiFullCache[q]` / `phraseCache[q]` | `…[q::core]` |

---

## 核心架构约定

### 存储层抽象（硬约束）

- 所有数据库操作必须通过 `src/services/db.ts` 的 `DBService`
- 组件和 hook **绝对不能**直接调用 sql.js / Capacitor SQLite API
- 实现分流：`db.web.ts` / `db.native.ts` / `db.extension.ts`，共享逻辑在 `db.ops.ts`
- 目的：后续切换原生 SQLite 时不改上层
- **扩展实现不复制查询与并发逻辑**：`db.web.ts` 的词库字节来源可注入（`setDbBytesSource`），
  `db.extension.ts` 只提供 OPFS + 远程下载这一层，再转发 `db.web` 的 `webDB`。改 `db.web.ts` 的
  加载/失效逻辑时，扩展会一起受影响（这是设计意图）。详见 `10-browser-extension.md` §3
- 删除已下载词库必须同时调 `invalidateDictionaries()` —— 只删 OPFS 文件的话，
  sql.js 的 `Database` 仍在内存里，删完照样能查

### AI 调用

- Instant：本地 L1 释义 / 例句；AI **不替换** L1
- AI Lookup：增量偏理解记忆（情景、词根、助记、轻量 coreConcept）；默认不拉搭配/近义墙
- Pure Core：按 `coreModules` 拉心智/概念树/介词语组/其他词组/用法场景/语域；**不拉释义墙**
- 必须异步，不阻塞 L1 渲染；切换词时用 `AbortController` 取消
- Session / persist 缓存见 `resultStore`（按规范化 query）
- 单英文模式与双语模式：助记、练习、写作批改、问答等 prompt 均需适配（见 `04-ai-schema.md`）
- AI 可返回 `correctForm` 做拼写纠正；视图大字显示正确拼写

### 词典与查词路由

- 双语：`public/assets/databases/lexicon.db`（OALD9，约 52k）
- 英英：`public/assets/databases/lexicon_en.db`（OALD10，约 84k）
- 英越：`public/assets/databases/lexicon_vi.db`（SPDict，约 83k，含越南语反向索引）
- Main Dictionary 可选英汉 / 英越 / 英英；单词、短语、句子的 Monolingual 开关按查询类型直接覆盖为英英，不再有 Auto Switch 开关。DB 与 AI 共用 `resolveDictionaryContext`；Profile / Prompt 通过 `resolveLearnerLanguagePolicy` 从同一有效词典解析学习者身份（英汉=`zh`、英越=`vi`、英英=`en`，无辅助语言）。

### 发音

- 单词 / 短语支持 UK / US 动态发音、自动发音、离线 TTS 兜底与播放微动效

### i18n

- UI 文案走 `t()` / `tStatic()`（`src/i18n/index.ts`）
- 模式品牌名 Instant / AI Lookup / Pure Core 与 UK/US **刻意保留英文**

### Profile / Lexicon Memory

- 类型与表：`UserLanguageProfile`、`UserWordMemory`、`user_word_memory` 等（见 `08`）
- 服务：`src/services/profile.ts`；开关 `enableProfileDiagnostic`
- **证据分轨**：同一个 Profile 内同时以 `learningDirection: 'in' | 'out'` 与 `learnerLanguage: 'en' | 'zh' | 'vi'` 分隔输入 / 输出和词典语言；旧的无方向数据禁止注入 prompt，旧的无语言数据只兼容中文分区。英文与当前有效词典的辅助语言均服从手动 IN / OUT；英英没有辅助语言，其他外语归 `irrelevant`。方向按钮始终可切换，搜索必须在首个异步等待前冻结提交时 route，后续切换只影响下一条查询。
- **诊断触发**：AI 追问只入队 + 90s idle / 硬边界（换词、Lookup↔Core、离 Dictionary、pagehide）再 flush；只有存在实质修改的 OUT 英文订正即时；查词累计 12；诊断固定事件快照，成功只删该快照并按剩余 lookup 重算计数；冷启动对含 chat/sentence 的队列续跑。
- **Profile 注入**：`buildProfilePromptContext(variant, route, learnerLanguage)` 只读取同方向同语言证据并排除 mastered；compact 最多 3 条热弱点 + 2 条探索方向，full 最多 6 条 active 弱点 + 3 条探索方向，均只能补充而不能取代标准分析。
- 笔记 / 对话 / Core 意象经 DBService API 持久化；Web 侧有 localStorage 备份防护

---

## 编码规范

- TypeScript **strict**，不用 `any`（与第三方库交互除外）
- 函数式组件 + hooks，不用 class component
- 样式只用 Tailwind utility；不写独立 CSS 文件；不用 inline style（动态计算值除外）
- 改 UI 前必读 `09-ui-ux-design-system.md`（尤其避免 Box-in-Box、对齐与间距规则）
- 导入顺序：React → 第三方库 → 内部 types → services / stores / hooks → 组件
- 命名：组件 `PascalCase.tsx`；hook `useCamelCase.ts`；store `camelCaseStore.ts`；service `camelCase.ts`
- 注释只解释「为什么」，不写显而易见的逻辑
- **只改任务需要的代码**；不顺手大重构、不擅自扩 scope
- **不擅自 git commit / push**；用户明确要求再提交
- 用户未要求时，不主动写 markdown 文档；但本仓库的「文档同步规范」例外（见下）

---

## 文档同步规范（硬约束）

完成下列改动后**必须**更新文档，不是可选步骤：

| 改动类型 | 需要更新的文件 |
|----------|----------------|
| 新增 / 删除 / 重命名组件 | `lexicon-docs/05-components.md` + `CHANGELOG.md` |
| 修改数据库 schema | `lexicon-docs/03-database.md` + `CHANGELOG.md` |
| 修改 AI prompt 或 JSON schema | `lexicon-docs/04-ai-schema.md` + `CHANGELOG.md` |
| 修改技术栈或依赖 | `lexicon-docs/01-architecture.md` + `AGENT.md`（本文件）+ `CHANGELOG.md` |
| 修改 Store 接口 | `lexicon-docs/05-components.md` + `CHANGELOG.md` |
| 导航 / 模式 / 雪藏决策 / 跨平台约定 | 相关 docs + `AGENT.md` + `CHANGELOG.md` |
| 用户可见功能增减、设置/下载/模式文案变更 | `README.md` + `README_en.md`（成对）+ `CHANGELOG.md` |
| 任何架构级重构 | 相关所有文档 + `AGENT.md` + `CHANGELOG.md` |

更新顺序：**先 `CHANGELOG.md` → 再设计文档 / 双 README → 最后 `AGENT.md`。**

辅助脚本：`lexicon-docs/scripts/check-doc-sync.sh`（检测开发文件变动是否漏更文档）。

**上传 / 发版门禁**：凡 `git push`、正式发版或用户要求「上传代码」，必须先执行根目录 `workflow.md` 的 **§0 上传前文档门禁**（用 git 锚定上次远程基线 → 补全 CHANGELOG → 校对中英文 README）。未通过门禁不得推送。

发版相关：Release Notes 以 `CHANGELOG.md` 为真相源；临时 notes 用完可删。签名 / `version.json` **必须**走 `scripts/release/*.ps1`（`Load-ReleaseEnv` → 构建 → `Sign-TauriBundle` → `Write-VersionJson` → `Assert-ReleaseGates`），禁止把路径塞进 `TAURI_SIGNING_PRIVATE_KEY`、禁止 BOM、禁止未通过门禁就 push（详见 `workflow.md` §3–§4）。

---

## 当前开发状态

<!-- 架构或重大产品决策变化时更新本区块 -->

### 已完成（里程碑摘要）

- [x] 项目脚手架、类型、Zustand stores、DB/AI 服务层、Hooks、基础组件
- [x] 词库：OALD9 英汉 + OALD10 英英 + SPDict 英越；按查询类型的单语言覆盖；中/越反向查词路由
- [x] AI 功能在单英文 / 双语模式下的 prompt 适配
- [x] UK/US 发音、自动发音、离线 TTS、播放动效
- [x] Pure Core（Mode 3）、设置模块化、认知模块开关
- [x] Lexicon Memory + IN/OUT 双通道轻量 User Profile 后端与 Settings `ProfileModal`
- [x] 弱项看板 UI 雪藏；底栏恢复 3 Tab
- [x] 界面语言全量 i18n；`LexiconMemoryBadge` 只读展示（`UserNoteEditor` 已雪藏）
- [x] 词组/句子 Lookup vs Pure Core：分轨 prompt + 缓存 + Core 心智优先 UI
- [x] 单词全量 Lookup vs Pure Core 分轨；Instant 未命中跟 `defaultSearchMode`；Lookup 点击即搜
- [x] Instant 复位 / 空态一致 / 历史双星分轨 / 强制 AI 文案 / 释义静默重试+板块补缺
- [x] Lookup / Core 模组学习流重组：defaults 分轨、chunks/collocations 拆分、双轨练习、Core 去 dictionary、prompt 读对应模组列表
- [x] Core 历史 / 全量缓存不再抢夺模式；模式切换一键触发 AI（v0.8.3）
- [x] `AGENT.md` 统一启动上下文；`workflow.md` §0 上传门禁；首页空态几何居中（v0.8.4）

### 最近一次重要改动

**2026-09-07** — Brave Search 适配（桌面走 Rust HTTP）+ 联网图片候选轮询 + 联网判定收敛：
- 联网是否发请求，唯一入口 `webSearchReady(config)`（`ai.ts`）：`webSearchEnabled === true && searchApiKey.length > 0`。开关切换**不**清结果缓存。
- 新增第二个联网搜索服务商 Brave Search：`settingsStore` 增 `searchProvider: 'tavily' | 'brave'` + `searchApiKeys`（按服务商分槽，旧 `tavilyApiKey` 经 `merge` 迁移、双写兼容）；Settings 内按钮式选择（复用 AI Provider 网格样式），`isWeb() && brave` 时显示「网页版不可用」提示。
- **Brave 平台差异**：Brave API 无浏览器 CORS 头。新增 `searchFetch()`（`ai.ts`）：`isTauri()` → 动态 import `@tauri-apps/plugin-http` 的 `fetch`（Rust 发请求、无 CORS）；否则全局 `fetch`。4 个搜索函数统一经它。新依赖 `tauri-plugin-http`（crate + `@tauri-apps/plugin-http`），`capabilities/default.json` 放行 `api.search.brave.com` / `api.tavily.com`。**Brave 仅桌面 / 移动可用，纯网页不可用。**
- `searchTavilyImage` → `searchWebImage`，返回 `string[]` 候选列表；`MeaningList` 逐个 `<img>` 尝试、`onError` 幂等前进、全挂落「无图 / Reload」。`braveTextSearch` 去 HTML + 追加 `extra_snippets`，200 无结果时 `console.warn` 打字段名。
- `vite.config.ts` dev COEP `require-corp` → `credentialless`（仍解锁 SharedArrayBuffer，但放行公共跨域图；仅 dev，Safari 不支持 `credentialless`，详见文件内注释）。
- **未验证**：`tauri:dev` 下 Brave 经 Rust 真正取回结果（需真机手测；`cargo build` + 能力校验已过，解析已 curl 对过，漂移有 `console.warn` 兜底，插件失败回退全局 `fetch`）。

此前（v0.9.16）：图像翻译扩展全平台相机拍照（Take Photo）；`src/services/camera.ts` 服务抽象。
此前（v0.9.9）：搜索栏与 AI 提问框升级为多行自适应 textarea；Web 搜索开关全站联动。
更早版本见 `CHANGELOG.md`（发版真相源）。

### 关键实现备忘

- 存储层：仅经 `DBService`；禁止直调 sql.js / Capacitor SQLite
- 词库路径：`public/assets/databases/lexicon.db`、`lexicon_en.db`、`lexicon_vi.db`
- Tailwind **v4**（非 v3），配置在 `src/index.css`
- sql.js **不能**加入 `optimizeDeps.exclude`，否则浏览器无法 import CJS，词库加载失败
  （注意：部分旧文档示例仍写 `exclude: ['sql.js']`，以本备忘与实际 `vite.config` 为准）
- `historyStore`：Zustand persist（localStorage），不走 `DBService.addHistory`
- `settingsStore`：`aiApiKeys` / `aiModels` 按服务商分 key；`searchProvider`（`tavily`\|`brave`）+ `searchApiKeys` 同理；含 `appearance`、`coreModules`、`enableProfileDiagnostic`、`defaultLearningDirection` 等。解析当前联网搜索 Key 用导出的 `resolveSearchApiKey()`；联网是否生效只看 `ai.ts` 的 `webSearchReady()`
- `searchStore`：`queryType`（word / phrase / sentence，`setQuery` 时自动推断）+ 当前会话 `learningDirection`（IN / OUT）
- `capacitor.config.ts`：`server.androidScheme: 'http'`；`plugins.CapacitorHttp.enabled: true`；`plugins.Keyboard.resize: 'none'`
- Android：`windowSoftInputMode="adjustResize"`；键盘遮挡由 `App.tsx` 监听 Capacitor Keyboard 事件动态处理
- Android：`networkSecurityConfig` 信任用户 CA + 允许明文（代理兼容）
- `src/index.css`：html/body 背景色兜底 + `overscroll-behavior: none`
- `index.html`：同步 inline script 读 `lexicon-settings` 的 `appearance`（兼容旧 `darkMode`）预加 `.dark`，并设 `color-scheme`，防挂载前白闪
- Appearance boot：`appearance-boot`（Capacitor Preferences / Tauri 文件）存 `{ dark, appearance }`；强制浅/深信 `dark`，`system` 冷启动跟 OS；壳色浅 `#FFFFFF` / 深 `#050505`
- Android：`Theme.SplashScreen` 不透明色 + `postSplashScreenTheme`；`LexiconApplication.applyAppearanceMode`（改设置时经 `AppearanceBoot` 插件立刻 `UiModeManager`）；`MainActivity` `installSplashScreen` + `setKeepOnScreenCondition`（JS `releaseSplash` / 2.5s 超时）；关 algorithmic darkening
- iOS：Splash / `LaunchBackground` Dark Appearance；`LexiconBridgeViewController` 在 `loadView`/`viewWillAppear`/`capacitorDidLoad` 涂 chrome；本地插件 `AppearanceBoot`；勿写死 `capacitor.config` `backgroundColor`。系统≠App 时 Launch 仍可能跟系统一帧
- Tauri：`visible: false` → setup 按 boot `set_theme` + 底色，**不**立刻 `show`；前端 `syncNativeWindowTheme` 的 `finally` 里 `show`（Rust 3s 兜底）
- Appearance：`appearance: 'light' | 'dark' | 'system'`（默认 `system`）；解析见 `src/services/appearance.ts`；调研 `lexicon-docs/research/system-appearance-crossplatform.md`、`splash-flash-ios-android.md`
- 冷启动顺序：Android = Application night → installSplashScreen(keep) → super.onCreate → WebView 底色 → JS releaseSplash；iOS = Launch(系统) → 读 boot → overrideUserInterfaceStyle → WebView/`underPageBackgroundColor`；Tauri = 隐藏窗涂 theme/底色 → JS show

---

## 已知问题 / 待解决

- **Android 代理兼容**：安装或更新 app 后，需重启 VPN / 代理连接（系统 VPN 路由表不自动包含新安装 app）

---

## 跨平台打包

- **Tauri（PC）**：`src-tauri/`；`npm run tauri:dev` / `npm run tauri:build`
  - Vite 通过 `TAURI_ENV_PLATFORM` 检测 Tauri，跳过 COOP/COEP headers（dev COEP 已从 `require-corp` 改 `credentialless`，见 `vite.config.ts` 注释）
  - PC 继续用 sql.js（WebView2），无需替换存储层
  - 插件：`process` / `updater` / `opener` / **`http`**（`tauri-plugin-http`，联网搜索经 Rust 绕 CORS，让 Brave 在 PC 可用；作用域在 `capabilities/default.json`）
  - 签名与发版细节见 `workflow.md`
- **Capacitor（Android）**：`android/`；`npx cap sync android` 后 Gradle 构建
  - 词库从 `dist/` 复制到 Android assets
  - 当前仍用 sql.js；后续可切 `@capacitor-community/sqlite`（依赖已在 package 中）
- **Capacitor（iOS）**：`ios/`；GitHub Actions（`.github/workflows/ios-build.yml`）
  - 触发：推 tag（`git tag vX.Y.Z && git push origin vX.Y.Z`）或 Actions 手动触发
  - 输出：未签名 `Lexicon.ipa` → GitHub Release
  - 安装：Sideloadly + 免费 Apple ID 自签（约 7 天）；详见 `06-crossplatform.md`
  - Capacitor 8 用 SPM（非 CocoaPods），无 xcworkspace；`xcodebuild` 用 `-project`
  - 打包：archive 后从 Products/Applications 取 `.app` 压成 IPA（绕过需 Team ID 的 exportArchive）
- **平台检测**：`src/services/platform.ts` → `isTauri()` / `isCapacitor()` / `isWeb()`

---

## 环境说明

- 开发机：Windows（主），亦可 Mac（iOS 本地相关）
- 编辑器 / Agent：Cursor、Claude Code、其他 AI 编码助手均可；以本文件为统一上下文
- Node：LTS（≥ 18）
- Rust：1.94+（Tauri）
- Android SDK：Capacitor Android 打包需要
- 词库 MDX **不进 git**（版权）；转换后的 `public/assets/databases/*.db` 进 git

---

## 常见陷阱（速查）

| 现象 | 优先检查 |
|------|----------|
| 词库加载失败 / sql.js import 异常 | 是否误把 sql.js 放进 `optimizeDeps.exclude` |
| AI JSON 解析失败 | `ai.ts` 打原始返回；对照 `04-ai-schema.md` |
| Core 被切回 AI Lookup | 历史 / 缓存路径是否在 `mode === 'core'` 时仍 `setMode('ai')` |
| 模式切换不触发请求 | 是否只靠 `aiStatus === 'idle'`；应走点击时的 `handleModeChange` |
| 追问记录对不上历史 | chat key 是否 `cognitiveCacheKey`（Lookup/Core 分轨） |
| UI 风格漂移 | 未读 `09-ui-ux-design-system.md`；设置是否又做成抽屉 |
| 误加第四个底栏 Tab | 看板已雪藏；勿恢复 Memory Tab |
| 输入框换行时一行/两行反复抖动、`Maximum update depth exceeded` | **布局反馈环**：让「是否换行」去改变 textarea 宽度（如按钮下沉腾宽），换行→变宽→不需换行→变窄→又换行。textarea 宽度必须恒定，按钮走 `absolute`；见 `05-components.md` 的 `useComposerFlowLayout` 硬约束 |
| 给 `flex-1` 的元素设 inline `width` 没反应 | `flex-basis: 0` 会让 flex 无视 `width`，须同时设 `flex: none` |

---

## 相关根目录文件

| 文件 | 用途 |
|------|------|
| `AGENT.md` | **本文件** — 全 Agent 权威启动上下文 |
| `CLAUDE.md` | 兼容跳转 → `AGENT.md` |
| `CHANGELOG.md` | 变更日志（文档与发版真相源之一） |
| `workflow.md` | 发版 / 上传 SOP（§0 文档门禁 + §3–4 签名硬门禁；脚本见 `scripts/release/`） |
| `README.md` / `README_en.md` | 人类用户向说明 |

---

## 移动端外观与冷启动性能记录 (v0.9.6 Status & Backlog)

- **实测现状**：
  - **iOS**：启动首帧原生壳为暗色过渡，无刺眼频闪，体验平滑受认可。
  - **Android**：冷启动前约 1 秒为深色底，随后平滑渲染最终主题。彻底解决了历史版本中的暴力频闪跳变、WebView 重载与暗黑模式启动崩溃。
- **详细记录与未来 Backlog**：见 [`lexicon-docs/research/splash-flash-ios-android.md`](./lexicon-docs/research/splash-flash-ios-android.md#8-实测反馈记录与后续优化-backlog-v096-status--future-roadmap)。

