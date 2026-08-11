# Lexicon

**Next-generation deep English learning tool for Chinese speakers** | **[中文版](./README.md)**

Lexicon is not just another translation app. Dual local dictionaries, cognitive preposition imagery, cultural register, and async AI analysis help you grasp meaning, tone, and etymology.

---

## 🚀 Key Features

### 1. Three lookup modes
- **Instant**: Local dictionary only — zero latency, offline (out-of-dict queries auto-trigger combined AI search).
- **AI Lookup**: Learn & remember — L1 first; light core image, roots, mnemonics, examples, prep imagery, meaning-check practice, and chat fade in.
- **Pure Core**: Native usage — usage image (short gloss + feel anchor + emotional tone), concept tree, prep / other collocations (may be empty for tag particles), synonyms with mental-fit notes (when the headword still wins), scenes, register, and usage-output practice (no definition wall; modules are reorderable).
- **Combined Dual-Track Results & Tag-Isolated Cache**: Single AI request generates both Lookup and Pure Core data; `normal` (standard search) and `bypass` (✨ force AI skipping dict) tag caches enable 0s instant toggling and side-by-side comparison; history items route via a 4-case smart decision tree.
- **Contextual Meaning Exercises**: Lookup practice links to `maxExercises` count setting, generating real-world example sentence cards for learners to check and understand sense in context.

### 2. Dual dictionaries & smart routing
- **Dictionaries**: OALD 9 bilingual (`lexicon.db`, ~52k) + OALD 10 English-English (`lexicon_en.db`, ~84k).
- **Monolingual hot-swap**: Independent word/phrase toggles; UI reflows and hides redundant Chinese when needed.
- **Chinese reverse routing & Core fix**: Chinese queries map via the bilingual DB; Pure Core explicitly guides AI to find authentic English counterparts and teach usage from a native perspective.
- **Fallback**: Missing English-English DB falls back to bilingual safely.

### 3. AI extras & personal assets
- Lookup / Core module lists are reorderable in Settings; in-context chat; contextual meaning-check vs usage-output practice.
- **UK / US pronunciation** (auto-play + offline TTS fallback).
- Lexicon Memory badges (read-only: notes / Core concept; **no** AI follow-up count badge — bottom AI Chat remains); AI follow-ups are stored on separate **Lookup / Pure Core** tracks; **AI Profile** diagnostics in Settings (follow-ups are batched before background distillation; unfinished jobs resume on cold start). Personal-notes editor is shelved; underlying memory data remains.
- Weakness-board UI is **shelved** (not in the tab bar); Profile backend remains available.

### 4. Preposition spatial imagery
- Cognitive metaphors for core prepositions (`up`, `out`, `off`, …).
- Per-item “regenerate” refresh.

### 5. Comic / screenshot batch translation
- Multi-image import, parallel translate, side-by-side reading, zoom/pan, export.

### 6. Platforms
- **Web** (WASM SQLite + OCR), **Windows** (Tauri v2), **Android / iOS** (Capacitor 8).

### Navigation
Bottom bar **3 tabs**: **Dict** / **Image** / **Settings** (full-page settings, not a drawer). Appearance supports Light / Dark / **System**.

---

## 📦 Download & Installation

### Windows
- **[Lexicon_0.9.8_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_x64-setup.exe)** (recommended, NSIS)
- **[Lexicon_0.9.8_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_x64_en-US.msi)** (MSI)

### Android (v0.9.8)
- **[Lexicon_0.9.8_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_universal_signed.apk)** (recommended)
- ABI splits: [Releases v0.9.8](https://github.com/jimytao/lexicon/releases/tag/v0.9.8).
- *If AI fails after install/update, restart your VPN/proxy.*

### iOS (sideload)
1. Install **[Sideloadly](https://sideloadly.io/)** (official iTunes + iCloud, not Store builds).
2. USB-connect iPhone, unlock, trust the computer.
3. Download `.ipa` from GitHub Releases → Sideloadly → Apple ID sign.
4. Before first launch: Settings → General → VPN & Device Management → Trust your Apple ID.

---

## ⚙️ AI Configuration

1. Open the bottom **Settings** tab.
2. Set **App Language** (Chinese / English); choose **Appearance** (Light / Dark / System).
3. Pick a provider (we recommend **Google Gemini**), paste the **API Key**, tap **Test Connection**.
4. Back in Dict, switch the top mode to **AI Lookup** or **Pure Core**.

> **Providers**: Google Gemini, OpenAI, Anthropic Claude, DeepSeek, Moonshot/Kimi, Zhipu GLM, 01.AI, SiliconFlow, OpenRouter, xAI/Grok, Perplexity, Mistral, Groq, Together AI, Custom Endpoint.

---

## ⌨️ Tips

- **Ctrl + Enter**: Force full AI lookup.
- **Search-box AI icon**: Bypass local dictionary for a direct AI definition.
- **Image flow**: Import → Translate all → Read → Export.
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
