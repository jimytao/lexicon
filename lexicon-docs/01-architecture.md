# 01 — 整体技术架构

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 框架 | React 18 + TypeScript | |
| 构建 | Vite 5 | |
| 样式 | Tailwind CSS v4 | 只用 utility class，不引入组件库 |
| 本地数据库 | sql.js（Web）/ @capacitor-community/sqlite（移动端） | 存储层已抽象，上层不感知 |
| 状态管理 | Zustand | 轻量，无 Redux 样板代码 |
| AI 调用 | 用户自填 API key，fetch 直接调用 | 支持任意 OpenAI-compatible endpoint |
| 图片 OCR | Tesseract.js（WASM） | 用于嵌字模式的文本区域定位，替代 VI 模型输出 bbox |
| 跨平台 | Capacitor（iOS/Android）+ Tauri（PC） | Web 代码零改动 |

## 核心依赖安装

```bash
npm install zustand sql.js tesseract.js
npm install -D tailwindcss @tailwindcss/vite
```

Vite 配置中需要处理 sql.js 的 WASM 文件：

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
// 注意：tesseract.js 的 WASM + worker 文件由 Vite 自动处理，无需额外配置
// CDN 下载 traineddata 语言包（如 jpn.traineddata ~16MB），首次加载后浏览器缓存
```

## 分层架构

```
┌─────────────────────────────────────────┐
│              UI Layer                   │
│   React Components（见 05-components） │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│           Store Layer                   │
│   Zustand stores：search / result /    │
│   settings / history                   │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────────┐
│  DB Service │  │    AI Service       │
│  db.ts      │  │    ai.ts            │
│（存储抽象）  │  │（API 调用 + 解析）  │
└──────┬──────┘  └─────────────────────┘
       │
  ┌────┴────────────────────────┐
  │  Web: sql.js (WASM)         │
  │  Mobile: Capacitor SQLite   │
  └─────────────────────────────┘
```

## 目录结构

```
lexicon/
├── public/
│   └── lexicon.db          # 预构建的 SQLite 词库（从 MDX 转换）
├── scripts/
│   └── mdx-to-sqlite.ts    # 一次性词库转换脚本（Node.js 运行）
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/         # 见 05-components.md
│   │   ├── SearchBar/
│   │   ├── SuggestList/
│   │   ├── ResultView/
│   │   │   ├── InstantResult/
│   │   │   └── AiResult/
│   │   └── Settings/
│   ├── services/
│   │   ├── db.ts           # 存储层抽象接口（见 03-database.md）
│   │   ├── ai.ts           # AI 调用服务（见 04-ai-schema.md）
│   │   └── ocr.ts          # Tesseract.js OCR 服务（图片文字定位）
│   ├── stores/
│   │   ├── searchStore.ts
│   │   ├── resultStore.ts
│   │   └── settingsStore.ts
│   ├── types/
│   │   └── index.ts        # 全局 TypeScript 类型
│   └── hooks/
│       ├── useSearch.ts
│       └── useAiLookup.ts
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

## 环境变量

```env
# .env.local（用户自填，不进 git）
VITE_AI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/openai
VITE_AI_MODEL=gemini-2.0-flash
VITE_AI_API_KEY=your_key_here
```

Settings 页面也可以在运行时覆盖这些值（存入 localStorage），优先级高于 .env。

## 全局 TypeScript 类型

```ts
// src/types/index.ts

export type Mode = 'instant' | 'ai'

export interface SuggestItem {
  word: string
  zhBrief: string        // 搜索补全用的简短中文释义，如"满意；满足感"
}

export interface Meaning {
  zh: string             // 带括号情景前缀的中文释义
  en: string             // 英文释义（来自词库）
  scene?: Scene          // 仅 AI mode 有
}

export interface Scene {
  label: string          // 简短标签，如"完成感驱动"
  description: string    // 1-3 句情景解释
}

export interface EtymologyPart {
  segment: string        // 如 "satis-"
  meaning: string        // 如 "足够（拉丁）"
}

export interface DerivedWord {
  word: string           // 派生词，如 "satisfactory"
  pos: string            // n./v./adj./adv.
  meaning: string        // 中文含义
}

export interface Etymology {
  parts: EtymologyPart[]
  story: string          // 1-2 句词源故事
  derivedWords: DerivedWord[]  // 3-6 个派生词
}

export interface Exercise {
  scenario: string       // 中文场景描述，让学习者用目标词造句
}

export interface EvaluationResult {
  correct: boolean
  feedback: string       // 具体错误说明（中文），correct 为 true 时为空
  correction: string     // 纠正后的句子，correct 为 true 时为空
}

export interface AiAnalysis {
  meanings: Array<{ zh: string; scene: Scene }>
  etymology: Etymology
  synonyms: Synonym[]
}

export interface Synonym {
  word: string
  distinction: string    // 与主词的区别，1 句话
}

export interface Example {
  en: string
  zh: string
}

export interface WordResult {
  word: string
  phonetic: string
  pos: string            // noun / verb / adj / adv 等
  meanings: Meaning[]
  examples: Example[]
  // 以下仅 AI mode 填充
  etymology?: Etymology
  synonyms?: Synonym[]
}
```
