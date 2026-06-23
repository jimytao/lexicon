# Lexicon

**Next-generation deep English learning tool for Chinese speakers** | **[中文版](./README.md)**

Lexicon is not just another translation tool. It helps you genuinely grasp English vocabulary through dual local databases, cognitive preposition spatial imagery, cultural register tags, and asynchronous AI-enhanced semantic analysis.

---

## 🚀 Key Features

### 1. Dual Local Databases & Fine-Grained Router
- **Multi-Dictionary Support**: Built-in **Oxford Advanced Learner's Dictionary 9th Edition (Bilingual, `lexicon.db`, 52k entries)** and **Oxford Advanced Learner's Dictionary 10th Edition (English-English, `lexicon_en.db`, 84k entries)**.
- **Dynamic Hot-Swapping**: Enable independent monolingual settings for words and phrases. The database manager automatically hot-swaps between English-English and bilingual databases, restructuring the UI to hide redundant translations under monolingual mode.
- **Chinese Query Smart Routing**: Queries containing Chinese characters are automatically intercepted and routed to the bilingual database for reverse mapping. Once mapped (e.g., "跑" -> "run"), subsequent definitions, AI analysis, and cache maps align with the English word ("run"), avoiding direct Chinese inputs to AI.
- **Fallback Protection**: Safe fallback mechanisms that automatically drop back to the bilingual dictionary if the English-English database is not found, preventing crashes.

### 2. Asynchronous AI-Enhanced Analysis
Local L1 dictionary contents render instantly, while L2 AI analysis modules load asynchronously in the background:
- **Semantic Context**: Explains the exact situation, emotional tone, and context of each definition in conversational language.
- **Etymology & Word Roots**: Breaks down prefix, root, and suffix morphemes, providing original Latin/Greek etymons, associative stories, and derived word networks.
- **Synonym/Antonym Nuances**: Compares 3-5 related words, pointing out differences in context, register, or intensity in a single sentence.
- **Chunks & Collocations**: Generates common verb/prep chunks and noun combinations with interactive hover tooltips explaining usage.
- **Cultural Lore & Register**: Categorizes social register (formal, informal, slang, technical, neutral) and explains historical background or slang origins.
- **AI Chat Box**: Interactive chat room contextually bound to the active word for instant vocabulary queries.
- **Practice Quizzes**: Generates customized contextual practice quizzes with instant grading and explanations.

### 3. Preposition Spatial Imagery (Cognitive Metaphors)
- Cognitive linguistic analysis for 13 core spatial prepositions (e.g., `up`, `out`, `off`, `on`, `over`, `in`).
- Deconstructs how prepositions shape the meanings of phrasal verbs, helping you learn them intuitively without rote memorization.
- Supports asynchronous single-preposition "Regenerate" (局部换一个) for individual items.

### 4. Batch Comic/Image Translation Workflow
- **Batch Processing**: Upload multiple images and translate them in parallel with independent progress indicators.
- **Optimized Reader**: Sticky top banner for original images, allowing side-by-side reading of translated segments. Supports Ctrl+Scroll wheel zoom and canvas panning.

### 5. Multi-Platform Support
- **Web App** — Works on any modern browser via WASM-based SQLite and OCR.
- **Windows Desktop** — Powered by Tauri v2 with native compilation. The installer is only ~5 MB and runs with minimal resource usage.
- **Android App** — Built via Capacitor, offering Universal signed APKs and optimized ABI split builds.
- **iOS App** — Built via Capacitor, installable via Sideloadly using a free Apple ID developer signature.

---

## 📦 Download & Installation

### Windows
- **[Lexicon_0.7.25_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_x64-setup.exe)** (Recommended, NSIS Installer)
- **[Lexicon_0.7.25_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_x64_en-US.msi)** (MSI Package, for enterprise deployment)

### Android
- **[Lexicon_0.7.25_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_universal_signed.apk)** (Recommended, compatible with all mainstream Android devices)
- ABI splits (`arm64-v8a` or `armeabi-v7a`) are available on the [Releases page](https://github.com/jimytao/lexicon/releases/tag/v0.7.25).
*Note: If AI queries fail after installation/update, simply restart your VPN or proxy connections.*

### iOS (Sideloading)
1. Install the **[Sideloadly](https://sideloadly.io/)** client on your PC (requires official iTunes and iCloud from Apple, not the Windows Store version).
2. Connect your iPhone via USB, unlock it, and select "Trust this computer."
3. Download the `.ipa` package from GitHub Releases and drag it into Sideloadly.
4. Enter your Apple ID in `Apple Account` and click **`Start`**. Input password and 2FA code if prompted, and wait for installation.
5. On your iPhone, go to **Settings → General → VPN & Device Management**, find your Apple ID, and tap **"Trust"**.

---

## ⚙️ AI Configuration

1. Click the ⚙️ **Settings** icon in the top right.
2. Under **App Language**, you can switch the UI between English and Chinese.
3. Select your preferred AI provider (we highly recommend **Google Gemini** for fast response times and generous free quotas).
4. Paste your **API Key** (toggle the eye icon to show/hide text).
5. Click **"Test Connection"** to verify.
6. Return to search and switch the query mode at the top to **AI mode** to unlock deep semantic analysis.

> **Supported Providers**: Google Gemini, OpenAI, Anthropic Claude, DeepSeek, Moonshot/Kimi, Zhipu GLM, 01.AI, SiliconFlow, OpenRouter, xAI/Grok, Perplexity, Mistral, Groq, Together AI, and Custom Endpoint.

---

## ⌨️ Tips & Shortcuts

- **Ctrl + Enter**: Forces a full AI lookup directly from the search box.
- **Search Box AI Icon**: Bypass the local dictionary and query the AI directly when you need customized explanations.
- **Comic Translation Flow**: Import images → click "Translate All" → batch read → select image and click "Typeset" for layout adjustments → export.
- **Cache Eviction**: Settings page footer provides one-click options to clear history and cached AI results for privacy.

---

## 🛠️ Run Locally

**Prerequisites**: Make sure [Node.js](https://nodejs.org/) LTS is installed (recommended ≥ 18).

```bash
# 1. Clone the repository
git clone https://github.com/jimytao/lexicon.git
cd lexicon

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open the address printed in the terminal (usually `http://localhost:5173/`).
*Note: During your first search, the browser will lazy-load and download the bilingual database (~32.8MB) in the background. Please wait a few seconds.*

---

## ⚙️ Platforms Build

```bash
# Build Web production bundle
npm run build

# Build Windows Desktop (requires local Rust tools configured)
npm run tauri:build

# Build Android App (requires Android SDK configured)
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 🧱 Tech Stack

- **Framework**: React 18 + TypeScript (Strict mode)
- **Bundler**: Vite 6
- **CSS Engine**: Tailwind CSS v4 (native-level styling speed)
- **State Management**: Zustand
- **Database**: sql.js (SQLite via WASM)
- **OCR Engine**: Tesseract.js (WASM image text extractor)
- **Desktop Shell**: Tauri v2
- **Mobile Shell**: Capacitor v8

---

## License

[MIT](LICENSE)
