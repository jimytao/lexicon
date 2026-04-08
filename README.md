# Lexicon

**English learning tool for Chinese speakers** | **面向中文母语者的英语学习工具**

Not just a dictionary — Lexicon helps you truly understand words through semantic scenes, etymology, synonym comparison, and AI-powered practice.

不只是翻译，而是真正理解词的语义情景、情感质感、词源脉络。

---

## Features | 功能

### Dictionary | 词库查词
- 52,000+ entries from OALD9 (Oxford Advanced Learner's Dictionary)
- Instant search with auto-complete, keyboard navigation
- Meanings, examples, related phrases
- Search history with persistence

### AI Mode | AI 增强模式
- **Semantic Scenes** — Conversational Chinese explanations of each meaning's usage context
- **Etymology** — Root/affix breakdown + origin story + derived words
- **Synonym Comparison** — Nuanced distinctions between similar words
- **Practice Exercises** — AI-generated scenarios for active recall, with real-time scoring
- **AI Chat** — Ask follow-up questions about any word or phrase
- **Spelling Correction** — Auto-detects and corrects misspelled input
- **Phrase & Sentence Query** — Not just single words; paste any phrase or sentence for analysis

### Image Translation | 图片翻译
- Upload manga/comics/screenshots
- AI Vision detects and translates all text regions
- Text overlay preview on canvas (bubble/sfx/caption classification)
- Export translated image as PNG

### Cross-Platform | 跨平台
- **Web** — Works in any modern browser
- **Windows** — Native desktop app (Tauri, ~5MB installer)
- **Android** — Mobile app (Capacitor)

---

## Tech Stack | 技术栈

| Layer | Tech |
|-------|------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Database | sql.js (SQLite via WASM) |
| AI | Any OpenAI-compatible API (Gemini, OpenAI, DeepSeek, etc.) |
| Desktop | Tauri v2 |
| Mobile | Capacitor v7 |

---

## Quick Start | 快速开始

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Desktop (Windows)

```bash
# Requires Rust toolchain
npm run tauri:dev    # Dev mode
npm run tauri:build  # Build .exe installer
```

### Android

```bash
# Requires Android SDK
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Configuration | 配置

1. Open the app and click the gear icon (top-right)
2. Select your AI provider (Gemini, OpenAI, DeepSeek, etc.)
3. Paste your API key
4. Click "Test Connection" to verify
5. Switch to AI mode to unlock enhanced analysis

支持 15+ AI 服务商，包括 Google Gemini、OpenAI、DeepSeek、Moonshot、智谱 GLM 等。

---

## Screenshots | 截图

*Coming soon*

---

## Project Structure | 项目结构

```
src/
├── components/       # React components
│   ├── SearchBar/    # Search input + suggestions + history
│   ├── ResultView/   # Dictionary results + AI analysis
│   ├── ImageTranslate/  # Image upload + translation
│   └── Settings/     # Settings drawer
├── services/         # db.ts (SQLite), ai.ts (API calls), platform.ts
├── stores/           # Zustand stores (search, result, settings, history, image)
├── hooks/            # useSearch, useAiLookup
└── types/            # TypeScript type definitions

src-tauri/            # Tauri desktop (Rust)
android/              # Capacitor Android
lexicon-docs/         # Architecture & design docs
```

---

## License | 许可

MIT
