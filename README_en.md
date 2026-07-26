# Lexicon

**Next-generation deep English learning tool for Chinese speakers** | **[中文版](./README.md)**

Lexicon is not just another translation app. Dual local dictionaries, cognitive preposition imagery, cultural register, and async AI analysis help you grasp meaning, tone, and etymology.

---

## 🚀 Key Features

### 1. Three lookup modes
- **Instant**: Local dictionary only — zero latency, offline (switching back shows L1 only; AI cache kept).
- **AI Lookup**: Learn & remember — L1 first; light core image, roots, mnemonics, examples, prep imagery, meaning-check practice, and chat fade in.
- **Pure Core**: Native usage — mind model, usage image, concept tree, prep phrases / other collocations, nuance, scenes, register, and usage-output practice (no definition wall).
- Mode switches apply **on click** (restore cache when present; otherwise trigger the matching lookup). History dual-stars mark Lookup vs Core tracks.

### 2. Dual dictionaries & smart routing
- **Dictionaries**: OALD 9 bilingual (`lexicon.db`, ~52k) + OALD 10 English-English (`lexicon_en.db`, ~84k).
- **Monolingual hot-swap**: Independent word/phrase toggles; UI reflows and hides redundant Chinese when needed.
- **Chinese reverse routing**: Chinese queries map via the bilingual DB; AI analysis and caches bind to the English headword.
- **Fallback**: Missing English-English DB falls back to bilingual safely.

### 3. AI extras & personal assets
- Lookup / Core module lists are reorderable in Settings; in-context chat; meaning-check vs usage-output practice.
- **UK / US pronunciation** (auto-play + offline TTS fallback).
- Lexicon Memory badges (read-only: notes / Core concept; **no** AI follow-up count badge — bottom AI Chat remains); AI follow-ups are stored on separate **Lookup / Pure Core** tracks; **AI Profile** diagnostics in Settings. Personal-notes editor is shelved; underlying memory data remains.
- Weakness-board UI is **shelved** (not in the tab bar); Profile backend remains available.

### 4. Preposition spatial imagery
- Cognitive metaphors for core prepositions (`up`, `out`, `off`, …).
- Per-item “regenerate” refresh.

### 5. Comic / screenshot batch translation
- Multi-image import, parallel translate, side-by-side reading, zoom/pan, typeset, export.

### 6. Platforms
- **Web** (WASM SQLite + OCR), **Windows** (Tauri v2), **Android / iOS** (Capacitor 8).

### Navigation
Bottom bar **3 tabs**: **Dict** / **Image** / **Settings** (full-page settings, not a drawer).

---

## 📦 Download & Installation

### Windows
- **[Lexicon_0.8.7_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.8.7/Lexicon_0.8.7_x64-setup.exe)** (recommended, NSIS)
- **[Lexicon_0.8.7_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.8.7/Lexicon_0.8.7_x64_en-US.msi)** (MSI)

### Android
- **[Lexicon_0.8.7_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.8.7/Lexicon_0.8.7_universal_signed.apk)** (recommended)
- ABI splits: [Releases v0.8.7](https://github.com/jimytao/lexicon/releases/tag/v0.8.7).
- *If AI fails after install/update, restart your VPN/proxy.*

### iOS (sideload)
1. Install **[Sideloadly](https://sideloadly.io/)** (official iTunes + iCloud, not Store builds).
2. USB-connect iPhone, unlock, trust the computer.
3. Download `.ipa` from GitHub Releases → Sideloadly → Apple ID sign.
4. Before first launch: Settings → General → VPN & Device Management → Trust your Apple ID.

---

## ⚙️ AI Configuration

1. Open the bottom **Settings** tab.
2. Set **App Language** (Chinese / English).
3. Pick a provider (we recommend **Google Gemini**), paste the **API Key**, tap **Test Connection**.
4. Back in Dict, switch the top mode to **AI Lookup** or **Pure Core**.

> **Providers**: Google Gemini, OpenAI, Anthropic Claude, DeepSeek, Moonshot/Kimi, Zhipu GLM, 01.AI, SiliconFlow, OpenRouter, xAI/Grok, Perplexity, Mistral, Groq, Together AI, Custom Endpoint.

---

## ⌨️ Tips

- **Ctrl + Enter**: Force full AI lookup.
- **Search-box AI icon**: Bypass local dictionary for a direct AI definition.
- **Image flow**: Import → Translate all → Read → Typeset → Export.
- **Clear history / cache**: Bottom of the Settings page.

---

## 🛠️ Run Locally

Requires [Node.js](https://nodejs.org/) LTS (≥ 18).

```bash
git clone https://github.com/jimytao/lexicon.git
cd lexicon
npm install
npm run dev
```

Open the URL printed in the terminal (e.g. `http://localhost:5173/`).  
*First lookup lazy-loads the dictionary (~30MB+); wait a few seconds.*

---

## ⚙️ Build

```bash
npm run build
npm run tauri:build
npx cap sync android && cd android && ./gradlew assembleRelease
```

Release SOP: [`workflow.md`](./workflow.md). Agent context: [`AGENT.md`](./AGENT.md).

---

## 🧱 Tech Stack

- React 18 + TypeScript (strict) · Vite 6 · Tailwind CSS v4 · Zustand  
- sql.js (SQLite WASM) · Tesseract.js · Tauri v2 · Capacitor v8  

---

## License

[MIT](LICENSE)
