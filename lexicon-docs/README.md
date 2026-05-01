# Lexicon — 个人英语词典 App

## 给 Claude Code 的启动说明

这个目录包含完整的项目设计文档，请在开始编码前**依次阅读所有文件**：

| 文件 | 内容 |
|------|------|
| `01-architecture.md` | 整体技术架构、技术栈、分层设计 |
| `02-ui-design.md` | UI 结构、交互逻辑、Instant/AI mode 设计 |
| `03-database.md` | 本地词库方案、SQLite schema、存储层抽象 |
| `04-ai-schema.md` | AI prompt、JSON 输出格式、skill 设计 |
| `05-components.md` | React 组件树、props 接口、状态管理 |
| `06-crossplatform.md` | Capacitor/Tauri 跨平台衔接方案 |

## 项目概述

**Lexicon** 是一个面向中文母语者的英语单词学习工具，核心理念是：

> 不只是翻译，而是真正理解一个词的语义情景、情感质感、词源脉络。

**两种模式：**
- **Instant mode**：纯本地 L1 词库，零延迟，离线可用
- **AI mode**：调用用户自己的 API key，返回结构化语义解析

**目标平台：**
- Web（Vite + React，开发基准）
- Android（Capacitor）
- iOS（Capacitor）
- PC（Tauri）

## 开发顺序

```
① Web 版（Vite + React）— 本文档覆盖范围
② Android（Capacitor 接入）
③ iOS（Capacitor，需 Mac）
④ PC（Tauri）
```

**当前阶段：完成 Web 版**，存储层从第一天就做抽象，方便后续 Capacitor 替换。

## 快速启动

```bash
npm create vite@latest lexicon -- --template react-ts
cd lexicon
npm install
npm run dev
```

依赖清单见 `01-architecture.md`。
