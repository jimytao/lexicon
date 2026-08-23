# Lexicon

**AI-Powered English Dictionary & Context Comprehension Tool for Desktop & Mobile** | **[中文版](./README.md)**

> 💡 **Not a flashcard app, but a deep reading & context comprehension assistant.**  
> Lexicon combines **dual offline local dictionaries (Oxford 9th Bilingual + Oxford 10th Monolingual)** with **multimodal AI context analysis**. Instead of force-feeding flashcards or spaced repetition, Lexicon is built for real-world reading, translation, comics, and writing—helping you **instantly look up definitions and deeply understand tone, feel anchors, preposition metaphors, and native speaker usage**.

---

## 🖼️ Real Application Screenshots

| AI Lookup & Memory Anchor (AI Lookup) | Comic & Manga OCR Translation (Comic Translation) |
| :---: | :---: |
| ![AI Lookup Result](./docs/images/02_lookup_result.png) | ![Comic Translation](./docs/images/03_comic_translate.png) |
| *Example query `dart`: Phonetics, CORE IMAGE memory anchor & deep definitions* | *Import manga/comics; auto OCR extracts text and generates bilingual cards* |

| Clean Home Interface & 3 Modes (Home Screen) | Flexible AI Provider & Web Search (Settings) |
| :---: | :---: |
| ![Home Screen](./docs/images/01_home_screen.png) | ![Settings Panel](./docs/images/05_settings.png) |
| *Minimalist glassmorphic UI; supports Instant / AI Lookup / Pure Core modes* | *Configurable Gemini (Flash Lite), DeepSeek, OpenAI, Ollama & Tavily Web Search* |

---

## 💡 Why Choose Lexicon?

There are many vocabulary flashcard apps (such as Anki, RemNote, etc.) focused on card repetition and spaced memory algorithms. Lexicon has a completely different purpose:

1. **No Rote Memorization**: We believe real vocabulary acquisition comes from deep context comprehension during reading, not mindless card flipping.
2. **Zero-Latency Offline Dictionaries**: Built-in Oxford Advanced Learner's Dictionary 9th Edition (Bilingual, ~52k entries) and 10th Edition (Monolingual English, ~84k entries) stored in local SQLite WASM. Works instantly without internet.
3. **Dual-Track AI Parsing**: Beyond dictionary definitions, AI breaks down emotional nuances, etymology, root mnemonics, synonym fit, and contextual practice cards.
4. **Cognitive Preposition Visualizer**: Visual breakdown of metaphoric prepositions (`up`, `out`, `off`, `through`) to master authentic English collocations naturally.
5. **Batch Image & Comic OCR Translation**: Tailored for manga readers, study notes, and document screenshots, featuring parallel OCR, smooth pan-and-zoom, and side-by-side bilingual overlay.

---

## 🚀 Key Feature Highlights

### 1. Three Dedicated Lookup Modes
- **Instant**: Offline local dictionary lookup with 0ms latency. Queries out of dictionary auto-trigger combined AI search.
- **AI Lookup**: Presents local L1 definitions alongside AI-generated root breakdowns, mnemonics, example verification, and follow-up Q&A chat.
- **Pure Core**: Replaces definition walls with **usage imagery (short gloss, feel anchors, emotional tone)**, concept trees, collocations, register notes, and output practice cards. Modules are reorderable via drag-and-drop.
- **Auto-Expanding Input**: Search bar dynamically expands from 1 to 4 lines with strict text wrapping for smooth mobile typing.
- **Dual-Track Cache & Comparison**: Single AI request generates both Lookup and Pure Core analyses, allowing instant 0ms track switching.

### 2. Dual Local Dictionaries & Smart Routing
- **Dual Oxford Engines**: Oxford 9th Edition Bilingual (~52k entries) + 10th Edition Monolingual (~84k entries).
- **Monolingual Hot-Toggle**: Switch freely between English-English and English-Chinese views with auto-adjusted layout.
- **Chinese Reverse Routing**: Reverse matches Chinese queries to authentic English words with native speaker mindset analysis.

### 3. Cognitive Preposition Imagery
- Cognitive breakdown of core metaphoric prepositions (`up`, `out`, `off`, `through`, etc.).
- Single metaphor "Regenerate" button for targeted spatial refresh.

### 4. Image & Comic Translation
- **Camera Capture & Batch Import**: Take instant photo on iOS / Android / Web / PC, or batch import local images for parallel OCR and AI translation.
- **Smooth Zoom & Pan Viewer**: Dual-touch / scroll-wheel canvas viewer with instant overlay comparison between original and translated text.
- **Export & Archive**: Supports long-image exports.

### 5. Flexible AI Engines & Real-Time Web Search
- **Universal Provider Integration**: Supports Google Gemini, OpenAI, DeepSeek, Claude, OpenRouter, SiliconFlow, and local privacy-first Ollama models.
- **Tavily AI Search Extension**: Live web search integration for slang, trending news terms, jargon, and contemporary phrases.

### 6. Cross-Platform Coverage
- **Desktop**: Windows (Tauri v2) / macOS (dmg)
- **Mobile**: Android (APK) / iOS (Capacitor 8)
- **Web**: WASM SQLite offline web app

---

## 📦 Download & Installation

> 🔄 **In-App Auto-Update Notice**:  
> Both **Windows** and **Android** native builds feature **seamless in-app automatic update checks**. When a new release is available, Lexicon will automatically prompt you with update notes or allow a one-click update directly in Settings, eliminating the need to manually re-download installer files.

### Windows
- **[Lexicon_0.9.15_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.9.15/Lexicon_0.9.15_x64-setup.exe)** (recommended, supports in-app auto updates)
- **[Lexicon_0.9.15_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.9.15/Lexicon_0.9.15_x64_en-US.msi)** (MSI Package)

### macOS Desktop (v0.9.15)
- **[Lexicon_0.9.15_universal.dmg](https://github.com/jimytao/lexicon/releases/download/v0.9.15/Lexicon_0.9.15_universal.dmg)** (Universal binary supporting Apple Silicon M1-M4 & Intel Macs)

> **⚠️ macOS First-Launch Guide ("Unidentified Developer" / "App Damaged" Bypass):**  
> As an open-source build without a paid Apple Developer ID certificate, macOS Gatekeeper blocks opening by default. Use any of the 3 simple methods below:
> 1. **Right-Click Open (Recommended & Easiest)**: Drag `Lexicon.app` to your `Applications` folder. Hold the `Control` key on your keyboard and right-click `Lexicon` → Select **Open**, then click **Open** again in the security prompt.
> 2. **System Settings Security Authorization**: If blocked directly, open **System Settings → Privacy & Security**, scroll down to the "Security" section, find "Lexicon was blocked", and click **Open Anyway**.
> 3. **Terminal Quarantine Removal (Ultimate Fix)**: If macOS claims the app is "damaged and cannot be opened", open **Terminal** and run the following command (enter your Mac user password when prompted):  
>    ```bash
>    sudo xattr -rd com.apple.quarantine /Applications/Lexicon.app
>    ```

### Android (v0.9.15)
- **[Lexicon_0.9.15_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.9.15/Lexicon_0.9.15_universal_signed.apk)** (recommended, supports in-app auto update checks)
- For ABI splits, see [Releases v0.9.15](https://github.com/jimytao/lexicon/releases/tag/v0.9.15).

### iOS (Sideload)
1. Install **[Sideloadly](https://sideloadly.io/)** (official iTunes + iCloud setup).
2. Connect iPhone via USB, unlock, and trust the computer.
3. Download `.ipa` from GitHub Releases → Drag into Sideloadly → Sign with Apple ID.
4. Before launching: Settings → General → VPN & Device Management → Trust your Apple ID.

---

## ⚙️ API Key & AI Configuration Guide

To activate AI enhancements, configure an API Key for your preferred provider. Lexicon natively supports standard OpenAI-compatible endpoints as well as the official Google Gemini protocol.

> **💡 Model Selection Advice**: For dictionary lookups and language learning workflows, **we strongly recommend selecting lightweight, high-speed model series** (such as `gemini-3.1-flash-lite-preview`, `Flash`, `Flash Lite`, `Mini`, `Haiku`, `Small`, etc.).

| AI Provider | Official Portal | Recommended Model Series |
|---|---|---|
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | `Flash` / `Flash Lite` series (ultra fast & low cost) |
| **DeepSeek** | [DeepSeek Platform](https://platform.deepseek.com/api_keys) | `DeepSeek Chat` fast lightweight model |
| **OpenAI (ChatGPT)** | [OpenAI API Platform](https://platform.openai.com/api-keys) | `gpt-4o-mini` lightweight series |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | Global aggregator; pick models tagged with `Flash` or `Mini` |
| **SiliconFlow** | [SiliconFlow Cloud](https://cloud.siliconflow.cn/account/ak) | Free & low-cost hosted endpoints for `DeepSeek` / `Qwen` |
| **Anthropic (Claude)** | [Anthropic Console](https://console.anthropic.com/settings/keys) | `Claude Haiku` lightweight series |
| **Ollama (Local Private)** | [Ollama Website](https://ollama.com/) | Privacy-first local models; set endpoint to `http://localhost:11434/v1` |
| **Tavily (Real-Time Search)** | [Tavily AI Platform](https://tavily.com/) | Real-time web retrieval API tailored for AI contextual analysis |

### Quick 5-Step Setup:
1. Obtain an API Key from any provider portal above.
2. Launch Lexicon and click **Settings** on the bottom navigation bar.
3. Expand **"AI Provider & Model"**, select your provider, and paste your API Key.
4. Click **"Fetch Models"** and pick a lightweight model (e.g., Flash or Mini).
5. Click **"Test Connection"** to verify and start searching!

---

## ⌨️ Useful Shortcuts & Tips

- **Ctrl + Enter**: Force full AI query execution.
- **AI icon on search bar (✨)**: Bypass local dictionary and query AI directly.
- **Comic / Image Workflow**: Import images → Batch translate → Side-by-side read → Export long image.
- **Cache Management**: Clear history and cache at the bottom of the Settings page.

---

## 🛠️ Local Development & Building

Requires [Node.js](https://nodejs.org/) LTS (≥ 18).

```bash
git clone https://github.com/jimytao/lexicon.git
cd lexicon
npm install
npm run dev
```

Open the local server URL in your browser (e.g. `http://localhost:5173/`).

### Building Production Bundles
```bash
npm run build
npm run tauri:build
npx cap sync android && cd android && ./gradlew assembleRelease
```

For release and workflow guidelines, see [`workflow.md`](./workflow.md) and [`AGENT.md`](./AGENT.md).

---

## 🧱 Tech Stack

- **Frontend / Core**: React 18 + TypeScript (strict) · Vite 6 · Tailwind CSS v4 · Zustand
- **Local Engine / OCR**: sql.js (SQLite WASM) · Tesseract.js
- **Cross-Platform**: Tauri v2 (Desktop) · Capacitor v8 (Mobile)

---

## License

[MIT License](LICENSE)
