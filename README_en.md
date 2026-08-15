# Lexicon

**Next-generation deep English learning tool for Chinese speakers** | **[中文版](./README.md)**

Lexicon is not just another translation app. Dual local dictionaries, cognitive preposition imagery, cultural register, and async AI analysis help you grasp meaning, tone, and etymology.

---

## 🚀 Key Features

### 1. Three lookup modes
- **Instant**: Local dictionary only — zero latency, offline (out-of-dict queries auto-trigger combined AI search).
- **AI Lookup**: Learn & remember — L1 first; light core image, roots, mnemonics, examples, prep imagery, meaning-check practice, and chat fade in.
- **Pure Core**: Native usage — usage image (short gloss + feel anchor + emotional tone), concept tree, prep / other collocations (may be empty for tag particles), synonyms with mental-fit notes (when the headword still wins), scenes, register, and usage-output practice (no definition wall; modules are reorderable).
- **Multi-line Auto-Expanding Input & Action Alignment**: Search bar and AI question box dynamically grow from 1 to 4 lines (capped at 110px) with strict text wrapping. Search bar smoothly transitions from `rounded-full` to `rounded-2xl` when expanding, while keeping top-left icons anchored and right action buttons bottom-aligned.
- **Combined Dual-Output & Tag-Isolated Cache**: Single AI request generates both Lookup and Pure Core datasets; establishes independent `normal` and `bypass` (✨ Force AI) tag caches for 0-second instant comparison; history items are retrieved via a 4-scenario smart decision tree.
- **Contextualized Example Practice**: Lookup mode connects to `maxExercises` setting, generating real-in-context English example cards to guide learners in verifying definitions within context.

### 2. Dual Local Dictionaries & Smart Routing
- **Multi-Dictionary Engine**: Oxford Advanced Learner's Dictionary 9th Edition (Bilingual, `lexicon.db`, ~52k entries) + 10th Edition (Monolingual English, `lexicon_en.db`, ~84k entries).
- **Monolingual Hot-Toggle**: Words/phrases independently support monolingual mode, switching seamlessly between English-English and English-Chinese rendering.
- **Chinese Reverse Routing & Core Fix**: Chinese queries route to the bilingual database for reverse lookup; Pure Core mode actively identifies authentic English target words with native speaker mindset.
- **Fallback Protection**: Missing English-English entries fall back to bilingual dictionary safely to avoid crashes.

### 3. AI Augmentation & Personal Assets
- Modular Lookup / Core components can be reordered or toggled in Settings; inline follow-up AI Chat & practice exercises.
- **UK / US Audio**: Native audio pronunciation with offline TTS fallback.
- Lexicon Memory Badge (Read-only notes / Core metaphors); AI follow-up history is stored per **Lookup / Pure Core** track; in-app **AI Profile** diagnostics.
- Weakness Dashboard UI is **sunsetted** from bottom navigation (backend Profile services remain fully functional).

### 4. Preposition Metaphor Visualizer
- Cognitive breakdown of core metaphoric prepositions (`up`, `out`, `off`, etc.).
- Single metaphor "Regenerate" button for targeted refresh.

### 5. Image & Comic Translation
- **Batch Import & Parallel Processing**: Multi-image OCR and parallel AI translation with progress tracking.
- **Smooth Zoom & Pan Viewer**: Dual-touch / scroll-wheel canvas viewer with instant overlay comparison between original and translated versions.
- **Export & Archive**: Supports long-image exports.

### 6. Real-Time Web Search Integration (Tavily AI Search)
- **Live Search Extension**: Connects with Tavily Search API for slang, trending news terms, jargon, and contemporary phrases.

### 7. Cross-Platform Engine
- **Web** (WASM SQLite + OCR), **Windows** (Tauri v2), **Android / iOS** (Capacitor 8).

### Navigation Layout
Bottom navigation features **3 Tabs**: **Dict** (Lookup) / **Image** (Translation) / **Settings** (Full-page settings). Supports Light / Dark / **Follow System** themes.

---

## 📦 Download & Installation

### Windows
- **[Lexicon_0.9.10_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.9.10/Lexicon_0.9.10_x64-setup.exe)** (recommended, NSIS)
- **[Lexicon_0.9.10_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.9.10/Lexicon_0.9.10_x64_en-US.msi)** (MSI)

### macOS Desktop (v0.9.10)
- **[Lexicon_0.9.10_universal.dmg](https://github.com/jimytao/lexicon/releases/download/v0.9.10/Lexicon_0.9.10_universal.dmg)** (Universal binary, supporting Apple Silicon M1-M4 & Intel Macs)
- **First-launch Gatekeeper Solutions ("Unidentified Developer" or "App Damaged"):**
  1. **Right-click Open (Fastest)**: Hold `Control` key or right-click `Lexicon.app`, select "Open", and click "Open" again in the dialog.
  2. **System Settings Permission**: Go to `System Settings` -> `Privacy & Security` -> scroll down to "Security", and click "Open Anyway".
  3. **Terminal Quarantine Removal**: If Gatekeeper flags the app as damaged, open Terminal and run: `sudo xattr -rd com.apple.quarantine /Applications/Lexicon.app`

### Android (v0.9.10)
- **[Lexicon_0.9.10_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.9.10/Lexicon_0.9.10_universal_signed.apk)** (recommended)
- ABI splits: [Releases v0.9.10](https://github.com/jimytao/lexicon/releases/tag/v0.9.10).
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

> **💡 Model Selection Guidelines**: AI models update and iterate extremely rapidly, so there's no need to strictly follow specific generation numbers. For Lexicon's dictionary lookups and language learning workflows, **we strongly recommend selecting lightweight, high-speed model series** (such as `Flash`, `Flash Lite`, `Mini`, `Nano`, `Haiku`, `Small`, `Lightning`, etc.). These lightweight small models offer ultra-fast responses, minimal cost, and more than enough accuracy for deep lexical parsing.

| AI Provider | Official API Key Portal | Recommended Model Series (Ignore Version Numbers) |
|-------------|-------------------------|--------------------------------------------------|
| **Google Gemini** | [Google AI Studio Platform](https://aistudio.google.com/app/apikey) | `Flash` / `Flash Lite` series (Ultra fast & lightweight) |
| **OpenAI (ChatGPT)** | [OpenAI API Platform](https://platform.openai.com/api-keys) | `Mini` / `Nano` / `Luna` lightweight series |
| **DeepSeek** | [DeepSeek Platform](https://platform.deepseek.com/api_keys) | `DeepSeek Chat` fast & lightweight model |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | Global aggregator; pick models tagged with `Flash`, `Mini`, or `Free` |
| **SiliconFlow (硅基流动)** | [SiliconFlow Cloud](https://cloud.siliconflow.cn/account/ak) | Free & low-cost endpoints for `DeepSeek` / `Qwen` small models |
| **Anthropic (Claude)** | [Anthropic Console](https://console.anthropic.com/settings/keys) | `Haiku` series (Fast & lightweight) |
| **Moonshot (Kimi)** | [Moonshot Platform](https://platform.moonshot.cn/console/api-keys) | Standard `Moonshot` lightweight model |
| **Zhipu GLM** | [Zhipu Open Platform](https://open.bigmodel.cn/usercenter/apikeys) | `GLM Flash` ultra-fast series |
| **01.AI (Yi)** | [01.AI Platform](https://platform.lingyiwanwu.com/apikeys) | `Yi Lightning` fast series |
| **Groq** | [GroqConsole](https://console.groq.com/keys) | Ultra high-speed Llama / Mixtral lightweight nodes |
| **xAI (Grok)** | [xAI Console](https://console.x.ai/) | `Grok Mini` series |
| **Perplexity** | [Perplexity API Settings](https://www.perplexity.ai/settings/api) | `Sonar` base model |
| **Together AI** | [Together AI Settings](https://api.together.xyz/settings/api-keys) | Pick `Small` / `Mini` hosted open-source endpoints |
| **Mistral** | [Mistral Console](https://console.mistral.ai/api-keys/) | `Mistral Small` series |
| **Ollama (Local Private Models)** | [Ollama Website](https://ollama.com/) | No API Key needed; run small quantized models (7B/8B/Q4) locally |
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
2. Select your desired lightweight, fast model from the dynamic dropdown list (e.g. models tagged with `Flash`, `Mini`, or `Chat`).

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
