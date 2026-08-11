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

### 5. Comic / screenshot batch translation (Image & Comic Translation)
- **Batch import & parallel translation**: Import multiple English/Chinese comic pages, textbook scans, or handouts; parallel OCR text extraction and AI translation with progress & side-by-side previews.
- **Pan, zoom & detailed reading**: Built-in smooth multi-touch & mouse wheel pan & infinite zoom viewer with 1-click toggle between original image and translated overlays.
- **Export & archiving**: Supports generating long image exports and local saves.

### 6. Real-time web search (Tavily Web Search Integration)
- **Real-time online grounding**: Integrated Tavily AI Search Platform API; automatically fetches real-time web context, news, slang, and technical jargon for AI prompt enhancement and accurate explanations.

### 7. Platforms
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

## ⚙️ API Key & Provider Setup Guide

To unlock Lexicon's AI capabilities, you need to configure an **API Key** for your preferred AI provider. Lexicon natively supports standard OpenAI-compatible endpoints as well as the official Google Gemini protocol, working seamlessly with both major cloud platforms and local privacy-first models.

### 1. Provider Registration & API Key Links (Direct Clickable Links)

| AI Provider | Official API Key Portal | Recommended Models / Notes |
|-------------|-------------------------|----------------------------|
| **Google Gemini** | [Google AI Studio Platform](https://aistudio.google.com/app/apikey) | `gemini-2.0-flash`, `gemini-1.5-pro` (Top recommendation, ultra fast) |
| **OpenAI (ChatGPT)** | [OpenAI API Platform](https://platform.openai.com/api-keys) | `gpt-4o`, `gpt-4o-mini` |
| **DeepSeek** | [DeepSeek Platform](https://platform.deepseek.com/api_keys) | `deepseek-chat`, `deepseek-reasoner` |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | Global model aggregator; single key for all models |
| **SiliconFlow (硅基流动)** | [SiliconFlow Cloud](https://cloud.siliconflow.cn/account/ak) | Free & low-cost endpoints for DeepSeek / Qwen |
| **Anthropic (Claude)** | [Anthropic Console](https://console.anthropic.com/settings/keys) | `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` |
| **Moonshot (Kimi)** | [Moonshot Platform](https://platform.moonshot.cn/console/api-keys) | `moonshot-v1-8k`, `moonshot-v1-32k` |
| **Zhipu GLM** | [Zhipu Open Platform](https://open.bigmodel.cn/usercenter/apikeys) | `glm-4-flash`, `glm-4` |
| **01.AI (Yi)** | [01.AI Platform](https://platform.lingyiwanwu.com/apikeys) | `yi-lightning`, `yi-large` |
| **Groq** | [GroqConsole](https://console.groq.com/keys) | Ultra high-speed Llama / Mixtral inference |
| **xAI (Grok)** | [xAI Console](https://console.x.ai/) | `grok-3`, `grok-3-mini` |
| **Perplexity** | [Perplexity API Settings](https://www.perplexity.ai/settings/api) | `sonar`, `sonar-pro` |
| **Together AI** | [Together AI Settings](https://api.together.xyz/settings/api-keys) | Hosts various open-source models |
| **Mistral** | [Mistral Console](https://console.mistral.ai/api-keys/) | `mistral-large`, `pixtral-12b` |
| **Ollama (Local Private Models)** | [Ollama Website](https://ollama.com/) | No API Key needed; launch Ollama and set Base URL |
| **Tavily (Real-Time Web Search)** | [Tavily AI Search Platform](https://tavily.com/) | Purpose-built search API for real-time AI contextual retrieval |

---

### 2. Step-by-Step Configuration Workflow

#### Step 1: Obtain your API Key
1. Click any provider link in the table above (e.g., [Google AI Studio](https://aistudio.google.com/app/apikey) or [DeepSeek Platform](https://platform.deepseek.com/api_keys)).
2. Sign in or create an account, then generate a new **API Key** (typically starting with `sk-...`, `AIza...`, etc.).
3. Copy the API Key. (Ensure your provider account has active credits if required).

#### Step 2: Open Lexicon Settings
1. Launch Lexicon and tap **Settings** in the bottom navigation bar (full-page tab).
2. Expand the **"AI Provider & Model"** accordion item at the top.

#### Step 3: Select Provider & Paste API Key
1. Select your provider from the grid (e.g., `Google Gemini`, `DeepSeek`, or `OpenRouter`). If using a reverse proxy or local Ollama instance, select `Custom` and enter the Endpoint URL (e.g., `http://localhost:11434/v1`).
2. Paste your API Key into the **API Key** input box. A green `Key Saved` indicator will appear.

#### Step 4: Fetch Models & Select
1. Click the **"Fetch Models"** button next to the model input box. Lexicon will query the provider for all available models on your account.
2. Select your desired model from the dynamic dropdown list (e.g., `gemini-2.0-flash` or `deepseek-chat`).

#### Step 5: Test Connection
1. Click the **"Test Connection"** button below.
2. Lexicon will execute a quick latency test. Once confirmed successful, all AI Features are activated! Return to the Dict tab to start querying.

#### Step 6: Configure Tavily Web Search (Optional)
1. In the **Settings** tab, scroll down to the **"Web Search"** toggle.
2. Turn on the toggle and enter your Tavily API Key (`tvly-...`) obtained from [Tavily AI Search Platform](https://tavily.com/).
3. Real-time web context will now enrich AI explanations and etymology breakdowns.

---

## ⌨️ Tips

- **Ctrl + Enter**: Force full AI search.
- **AI icon on search bar**: Bypass local dictionary and query AI directly.
- **Image flow**: Import images → Translate all → Compare & read → Export.
- **Clear history / cache**: Manage at the bottom of the Settings page.

---

## 🛠️ Local Development

Requires [Node.js](https://nodejs.org/) LTS (≥ 18).

```bash
git clone https://github.com/jimytao/lexicon.git
cd lexicon
npm install
npm run dev
```

Open the local server URL in your browser (e.g. `http://localhost:5173/`).  
*First query lazy-loads the local dictionary (~30MB+), please allow a few seconds.*

---

## ⚙️ Building

```bash
npm run build
npm run tauri:build
npx cap sync android && cd android && ./gradlew assembleRelease
```

For release and upload guidelines, see [`workflow.md`](./workflow.md); agent context in [`AGENT.md`](./AGENT.md).

---

## 🧱 Tech Stack

- React 18 + TypeScript (strict) · Vite 6 · Tailwind CSS v4 · Zustand  
- sql.js (SQLite WASM) · Tesseract.js · Tauri v2 · Capacitor v8  

---

## License

[MIT](LICENSE)
