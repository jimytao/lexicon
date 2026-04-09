# CLAUDE.md — Lexicon 项目

> 这个文件是 Claude Code 的启动上下文，每次会话自动读取。
> **修改代码架构后必须同步更新本文件**，否则下次会话 CC 会基于过期信息工作。

---

## 项目简介

**Lexicon** — 面向中文母语者的英语单词学习工具。
开发者：Julian（中文母语，英语学习者）

核心理念：不只是翻译，而是真正理解词的语义情景、情感质感、词源脉络。

## 设计文档位置

所有架构决策都记录在 `lexicon-docs/` 目录，**遇到任何架构问题先查文档再动代码**：

| 文档 | 读取时机 |
|------|----------|
| `lexicon-docs/01-architecture.md` | 技术栈、目录结构、全局类型有疑问时 |
| `lexicon-docs/02-ui-design.md` | 任何 UI/交互相关任务 |
| `lexicon-docs/03-database.md` | 词库、SQLite、存储层相关任务 |
| `lexicon-docs/04-ai-schema.md` | AI 调用、prompt、JSON schema 相关任务 |
| `lexicon-docs/05-components.md` | 组件结构、store、hook 相关任务 |
| `lexicon-docs/06-crossplatform.md` | Capacitor/Tauri 跨平台相关任务 |

## 当前技术栈

```
React 18 + TypeScript（strict）
Vite 5
Tailwind CSS v3
Zustand（状态管理）
sql.js（本地 SQLite，WASM）
```

目标平台：Web → Android（Capacitor）→ iOS（Capacitor）→ PC（Tauri）
**当前阶段**：Web 版开发中

## 核心架构约定

### 存储层抽象（重要）
- 所有数据库操作必须通过 `src/services/db.ts` 的 `DBService` 接口
- 组件和 hook **绝对不能**直接调用 sql.js API
- 这是为了后续 Capacitor 切换不改上层代码

### AI 调用
- AI 只提供增量内容（语义情景、词根词缀、近义词辨析）
- 释义和例句始终来自本地词库（L1），AI 不替换它们
- AI 调用必须异步，不阻塞 L1 内容渲染
- 用 AbortController 取消未完成请求（切换词时）
- Session 内缓存 AI 结果（Map，key 为 word）

### 模式设计
- **Instant mode**：纯本地词库，零延迟，离线可用
- **AI mode**：L1 内容立即渲染，AI 板块 skeleton 等待，数据到后淡入

### 信息渲染顺序（AI mode）
释义 → 语义情景 → 词根词缀 → 近义词辨析 → 例句
（认知建构路径：概念→理解→溯源→对比→应用）

## 编码规范

- TypeScript strict 模式，不用 `any`（与第三方库交互除外）
- 函数式组件 + hooks，不用 class component
- 样式只用 Tailwind utility class，不写 CSS 文件
- 不用 inline style（除非动态计算的值）
- 导入顺序：React → 第三方库 → 内部 types → services/stores/hooks → 组件

## 文档同步规范（重要）

**每次完成以下类型的改动后，必须依次更新文档，这不是可选步骤：**

| 改动类型 | 需要更新的文件 |
|----------|---------------|
| 新增/删除/重命名组件 | `lexicon-docs/05-components.md` + `CHANGELOG.md` |
| 修改数据库 schema | `lexicon-docs/03-database.md` + `CHANGELOG.md` |
| 修改 AI prompt 或 JSON schema | `lexicon-docs/04-ai-schema.md` + `CHANGELOG.md` |
| 修改技术栈或依赖 | `lexicon-docs/01-architecture.md` + `CLAUDE.md`（本文件）+ `CHANGELOG.md` |
| 修改 Store 接口 | `lexicon-docs/05-components.md` + `CHANGELOG.md` |
| 任何架构级重构 | 相关所有文档 + `CLAUDE.md` + `CHANGELOG.md` |

更新顺序：**先更新 CHANGELOG.md，再更新设计文档，最后更新 CLAUDE.md**。

## 当前开发状态

<!-- 每次会话结束时更新这个区块 -->

- [x] Step 1-5：项目初始化、依赖安装、目录结构
- [x] Step 6：类型文件
- [x] Step 7：Zustand stores
- [x] Step 8：服务层（db.ts + ai.ts）
- [x] Step 9：Hooks
- [x] Step 10：所有组件
- [x] Step 11：基础功能验证（TypeScript 零报错，vite build 通过）
- [x] Step 12：词库导入（MDX → SQLite）— OALD9，52k 词条，public/lexicon.db 31MB

**最近一次重要改动**：2026-04-09，Bug Fix — Android 键盘色块 + AI 请求失败 + PC 暗黑过滚

**注意**：
- 安装的 Tailwind 是 v4（非 v3），配置在 src/index.css，`@variant dark` 为 class-based
- sql.js **不能** 加入 `optimizeDeps.exclude`，否则浏览器无法 import CJS 模块，词库加载失败
- `historyStore` 用 Zustand persist 维护历史（localStorage），不走 `DBService.addHistory`
- `settingsStore` 用 `aiApiKeys: Record<string, string>` 按服务商存 API Key
- `searchStore` 有 `queryType`（word/phrase/sentence），`setQuery` 时自动推断
- `resultStore` 有三路结果：`wordResult`（词库）、`aiFullResult`（AI 全量单词）、`phraseResult`（AI 词组/句子）
- App.tsx 按三路结果条件渲染 ResultView / AiFullView / PhraseView
- AI prompt 返回 `correctForm` 用于拼写纠正，视图大字显示正确拼写
- `capacitor.config.ts` 配置了 `server.androidScheme: 'http'`（避免 localhost 自签证书问题）、`plugins.CapacitorHttp.enabled: true`（原生 HTTP 栈）和 `plugins.Keyboard.resize: 'none'`
- Android `windowSoftInputMode="adjustPan"` 防止键盘弹出时缩小 WebView
- Android `networkSecurityConfig` 信任用户 CA 证书 + 允许明文流量（代理软件兼容）
- `src/index.css` 的 html/body 有背景色兜底（防 overscroll 白色）+ `overscroll-behavior: none`

## 已知问题 / 待解决

- **Android 代理兼容**：安装或更新 app 后，需重启 VPN 代理连接（Android VPN 路由表不自动包含新安装 app）

## 跨平台打包

- **Tauri（PC）**：`src-tauri/` 目录，`npm run tauri:dev` 开发，`npm run tauri:build` 打包
  - Vite 通过 `TAURI_ENV_PLATFORM` 环境变量检测 Tauri 模式，跳过 COOP/COEP headers
  - PC 端继续用 sql.js（WASM 在 WebView2 正常工作），无需替换存储层
- **Capacitor（Android）**：`android/` 目录，`npx cap sync android` 同步，Gradle 构建 APK
  - 词库自动从 `dist/` 复制到 Android assets
  - 当前仍用 sql.js，后续可切换 `@capacitor-community/sqlite`
- **平台检测**：`src/services/platform.ts` 提供 `isTauri()` / `isCapacitor()` / `isWeb()`

## 环境说明

- 开发机：Windows
- 编辑器：VSCode + Claude Code
- Node 版本：请用 LTS（≥18）
- Rust 版本：1.94+（Tauri 打包需要）
- Android SDK：需安装（Capacitor 打包需要）
- 词库文件（MDX）不进 git（版权），词库转换后的 `public/lexicon.db` 进 git
