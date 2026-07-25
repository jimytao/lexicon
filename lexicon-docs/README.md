# Lexicon — 设计文档目录

## 给 AI Agent 的说明

本目录是项目架构与设计决策的权威来源。编码前请先读根目录 [`AGENT.md`](../AGENT.md)，再按任务打开对应文档。

| 文件 | 内容 |
|------|------|
| `01-architecture.md` | 整体技术架构、技术栈、分层设计、全局类型 |
| `02-ui-design.md` | UI 结构、交互逻辑、Instant / AI Lookup / Pure Core |
| `03-database.md` | 本地词库、SQLite schema、存储层抽象 |
| `04-ai-schema.md` | AI prompt、JSON 输出格式、skill 设计 |
| `05-components.md` | React 组件树、props、Zustand stores、hooks |
| `06-crossplatform.md` | Capacitor / Tauri 跨平台方案与打包 SOP |
| `07-cognitive-and-settings-architecture.md` | 深度认知体系、Mode 3、设置 UI 架构 |
| `08-ai-learning-system-and-profile.md` | User Profile、Lexicon Memory |
| `09-ui-ux-design-system.md` | UI/UX 规范（改 UI 必读） |
| `CC-INSTRUCTIONS.md` | 历史初始化步骤档案 + 少量持续 Agent 指令 |
| `scripts/check-doc-sync.sh` | 文档同步检查（开发文件变动是否漏更 docs） |

根目录另有：

- [`AGENT.md`](../AGENT.md) — 全 Agent 统一启动上下文  
- [`CHANGELOG.md`](../CHANGELOG.md) — 变更日志  
- [`workflow.md`](../workflow.md) — 发版 SOP  

## 项目概述

**Lexicon** 是面向中文母语者的英语单词学习工具，核心理念：

> 不只是翻译，而是真正理解一个词的语义情景、情感质感、词源脉络。

**查词模式：**

- **Instant**：纯本地 L1 词库，零延迟，离线可用  
- **AI Lookup**：L1 立即渲染 + AI 增量语义解析（用户自备 API Key）  
- **Pure Core**：深度认知全量视图  

**底栏导航（当前）：** Dict / Image / Settings（3 Tab）。弱项看板 UI 已雪藏，见 `AGENT.md`。

**目标平台：**

- Web（Vite + React，开发基准）
- Android（Capacitor）
- iOS（Capacitor）
- PC（Tauri）

## 开发顺序（历史）

```
① Web 版（Vite + React）
② Android（Capacitor）
③ iOS（Capacitor）
④ PC（Tauri）
```

多端构建链路已就绪；功能迭代仍以 Web 为基准。存储层从第一天起做抽象（`DBService`），便于后续替换实现。

依赖与目录细节见 `01-architecture.md`。本地开发：

```bash
npm install
npm run dev
```
