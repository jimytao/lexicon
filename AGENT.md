# AGENT.md — Lexicon 项目（AI Agent 启动上下文）

> **本文件是所有 AI Agent（Cursor / Claude Code / Codex / 其他）的统一项目上下文。**
> 会话开始时请先读本文件；涉及具体子系统时再按下方索引打开 `lexicon-docs/`。
>
> **修改架构、导航、模式、存储层或跨平台约定后，必须同步更新本文件**，否则后续会话会基于过期信息工作。
>
> 兼容入口：根目录 `CLAUDE.md` 仅指向本文件（供仍自动加载 `CLAUDE.md` 的工具使用）。权威内容以 **本文件** 为准。

---

## 项目简介

**Lexicon** — 面向中文母语者的英语单词学习工具。  
开发者：Julian（中文母语，英语学习者）

核心理念：不只是翻译，而是真正理解词的语义情景、情感质感、词源脉络。

当前版本：**v0.8.4**（以 `package.json` / `src/stores/updateStore.ts` 为准）。

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
| `lexicon-docs/README.md` | docs 目录总览 |
| `workflow.md`（根目录） | 发版 SOP（版本号、Release Notes、打包） |

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
Tauri 2（PC）
```

目标平台：Web → Android（Capacitor）→ iOS（Capacitor）→ PC（Tauri）  
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
- **禁止**重新加 Memory Tab 或首页弱项看板，除非用户明确要求解封
- Settings 内 `ProfileModal` 与 Profile / `user_word_memory` **后端仍可用**

### 查词三种模式

| 模式 | store 值 | 品牌名（UI 保留英文） | 行为摘要 |
|------|----------|----------------------|----------|
| Instant | `instant` | Instant | 纯本地词库，零延迟，离线可用 |
| AI Lookup | `ai` | AI Lookup | L1 立即渲染；AI 增量板块 skeleton → 淡入 |
| Pure Core | `core` | Pure Core | 深度认知全量视图（Core UI）；依赖全量 AI schema |

- 默认模式：`settingsStore.defaultSearchMode`（`instant` \| `ai` \| `core`）
- 模式切换应**点击即生效**（有缓存恢复，无缓存立刻触发对应 lookup）；勿仅依赖可能不同步的 `useEffect`
- 在 **Core** 下命中全量缓存 / 历史回放时，**禁止**强制切回 `ai`

### 结果渲染路径

`App.tsx` 按结果条件渲染：

- `ResultView` — 词库 L1 + AI 增量（Instant / AI Lookup）
- `AiFullView` — AI 全量单词结果
- `CoreCognitiveView` — Pure Core
- `PhraseView` — 词组 / 句子

`resultStore` 三路结果 + 缓存：

- `wordResult`（词库）
- `aiFullResult` + `aiFullCache`
- `phraseResult` + `phraseCache`
- 另有增量 `aiAnalysis` + `aiCache`

历史约 100 条；AI 追问（chat）缓存 key 使用 `normalizeQuery`，须与历史 / 三路 AI 缓存配对一致。

### 信息渲染顺序（AI Lookup）

释义 → 语义情景 → 词根词缀 → 近义词辨析 → 例句  
（认知路径：概念 → 理解 → 溯源 → 对比 → 应用）

四路结果页（含 AiFull / Core / Phrase 等）统一提供 `UserNoteEditor`；`LexiconMemoryBadge` 经 `openUserNotes()` 跳转笔记区；无回调时 Badge 降级为不可点 `span`。

---

## 核心架构约定

### 存储层抽象（硬约束）

- 所有数据库操作必须通过 `src/services/db.ts` 的 `DBService`
- 组件和 hook **绝对不能**直接调用 sql.js / Capacitor SQLite API
- 实现分流：`db.web.ts` / `db.native.ts`，共享逻辑在 `db.ops.ts`
- 目的：后续切换原生 SQLite 时不改上层

### AI 调用

- Instant：本地 L1 释义 / 例句；AI **不替换** L1
- AI Lookup：AI 只提供增量（语义情景、词根词缀、近义词等）
- Pure Core / 全量 lookup：拉取完整 schema（词根、近义、文化语域等 Core UI 所需字段）
- 必须异步，不阻塞 L1 渲染；切换词时用 `AbortController` 取消
- Session / persist 缓存见 `resultStore`（按规范化 query）
- 单英文模式与双语模式：助记、练习、写作批改、问答等 prompt 均需适配（见 `04-ai-schema.md`）
- AI 可返回 `correctForm` 做拼写纠正；视图大字显示正确拼写

### 词典与查词路由

- 双语：`public/assets/databases/lexicon.db`（OALD9，约 52k）
- 英英：`public/assets/databases/lexicon_en.db`（OALD10，约 84k）
- 单语言模式自动切换词典；中文反向查词可强制路由双语库，并与 AI 分析 / 缓存实体对齐

### 发音

- 单词 / 短语支持 UK / US 动态发音、自动发音、离线 TTS 兜底与播放微动效

### i18n

- UI 文案走 `t()` / `tStatic()`（`src/i18n/index.ts`）
- 模式品牌名 Instant / AI Lookup / Pure Core 与 UK/US **刻意保留英文**

### Profile / Lexicon Memory

- 类型与表：`UserLanguageProfile`、`UserWordMemory`、`user_word_memory` 等（见 `08`）
- 服务：`src/services/profile.ts`；开关 `enableProfileDiagnostic`
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

发版相关：Release Notes 以 `CHANGELOG.md` 为真相源；`release_notes_zh.md` / `release_notes_en.md` 仅发版时**临时生成**，用完可删、不必入库（见 `workflow.md`）。

---

## 当前开发状态

<!-- 架构或重大产品决策变化时更新本区块 -->

### 已完成（里程碑摘要）

- [x] 项目脚手架、类型、Zustand stores、DB/AI 服务层、Hooks、基础组件
- [x] 词库：OALD9 双语 + OALD10 英英；单语言自动切换；中文反向查词路由
- [x] AI 功能在单英文 / 双语模式下的 prompt 适配
- [x] UK/US 发音、自动发音、离线 TTS、播放动效
- [x] Pure Core（Mode 3）、设置模块化、认知模块开关
- [x] Lexicon Memory + 轻量 User Profile 后端与 Settings `ProfileModal`
- [x] 弱项看板 UI 雪藏；底栏恢复 3 Tab
- [x] 四路结果页统一笔记区 + Badge 跳转；界面语言全量 i18n
- [x] Core 历史 / 全量缓存不再抢夺模式；模式切换一键触发 AI（v0.8.3）
- [x] `AGENT.md` 统一启动上下文；`workflow.md` §0 上传门禁；首页空态几何居中（v0.8.4）

### 最近一次重要改动

**2026-07-25（v0.8.4）** — 首页空态 `fixed` 几何居中；`AGENT.md` + workflow §0 门禁；中英文 README 对齐三模式 / 底栏 Settings / 下载链接。

此前同日（v0.8.3）：Instant / AI Lookup → Pure Core 点击即搜；追问缓存 `normalizeQuery` 对齐。

### 关键实现备忘

- 存储层：仅经 `DBService`；禁止直调 sql.js / Capacitor SQLite
- 词库路径：`public/assets/databases/lexicon.db`、`lexicon_en.db`
- Tailwind **v4**（非 v3），配置在 `src/index.css`
- sql.js **不能**加入 `optimizeDeps.exclude`，否则浏览器无法 import CJS，词库加载失败  
  （注意：部分旧文档示例仍写 `exclude: ['sql.js']`，以本备忘与实际 `vite.config` 为准）
- `historyStore`：Zustand persist（localStorage），不走 `DBService.addHistory`
- `settingsStore`：`aiApiKeys` / `aiModels` 按服务商分 key；含 `coreModules`、`enableProfileDiagnostic` 等
- `searchStore`：`queryType`（word / phrase / sentence），`setQuery` 时自动推断
- `capacitor.config.ts`：`server.androidScheme: 'http'`；`plugins.CapacitorHttp.enabled: true`；`plugins.Keyboard.resize: 'none'`
- Android：`windowSoftInputMode="adjustResize"`；键盘遮挡由 `App.tsx` 监听 Capacitor Keyboard 事件动态处理
- Android：`networkSecurityConfig` 信任用户 CA + 允许明文（代理兼容）
- `src/index.css`：html/body 背景色兜底 + `overscroll-behavior: none`
- `index.html`：同步 inline script 读 `lexicon-settings` 预加 `.dark`，防挂载前白闪
- Android `values-night/styles.xml`：深色 splash（`splash_dark`）
- Tauri：`backgroundColor: "#030712"` 防原生窗口白闪（浅色用户启动瞬间可能见深色，不足 200ms）

---

## 已知问题 / 待解决

- **Android 代理兼容**：安装或更新 app 后，需重启 VPN / 代理连接（系统 VPN 路由表不自动包含新安装 app）

---

## 跨平台打包

- **Tauri（PC）**：`src-tauri/`；`npm run tauri:dev` / `npm run tauri:build`
  - Vite 通过 `TAURI_ENV_PLATFORM` 检测 Tauri，跳过 COOP/COEP headers
  - PC 继续用 sql.js（WebView2），无需替换存储层
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
| 追问记录对不上历史 | chat key 是否 `normalizeQuery` |
| UI 风格漂移 | 未读 `09-ui-ux-design-system.md`；设置是否又做成抽屉 |
| 误加第四个底栏 Tab | 看板已雪藏；勿恢复 Memory Tab |

---

## 相关根目录文件

| 文件 | 用途 |
|------|------|
| `AGENT.md` | **本文件** — 全 Agent 权威启动上下文 |
| `CLAUDE.md` | 兼容跳转 → `AGENT.md` |
| `CHANGELOG.md` | 变更日志（文档与发版真相源之一） |
| `workflow.md` | 发版 / 上传 SOP（含 §0 文档门禁） |
| `README.md` / `README_en.md` | 人类用户向说明 |
