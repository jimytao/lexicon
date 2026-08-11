# Lexicon

**面向中文母语者的下一代英语深度学习工具** | **[English Version](./README_en.md)**

不只是查词翻译，而是通过双本地词库、认知语言学介词空间隐喻、多语域文化背景以及 AI 异步增强分析，帮助你真正理解英语单词的语义情景、情感质感与词源脉络。

---

## 🚀 核心特性

### 1. 三种查词模式
- **Instant**：纯本地词库，零延迟，离线可用（词库外输入自动触发 AI 合并搜索）。
- **AI Lookup**：理解与记忆——L1 立即呈现；轻量意象、词根、助记、例句、介词意象、释义核对练习与 Chat 异步淡入。
- **Pure Core**：母语者用法——用法意象（含短对译 gloss / 感觉锚 / 情绪底色）、概念树、介词语组/其他词组（尾缀类词可空）、近义（适用心智含「为何仍选主词」）、用法场景、语域与造句练习（无释义墙；模组均可拖拽排序）。
- **合并双轨出参与 Tag 隔离缓存**：单次 AI 请求同时生成 Lookup 与 Pure Core 两套数据；建立 `normal`（普通搜索）与 `bypass`（✨ 强搜旁路词库）独立双轨 Tag 缓存，支持两套成果 0 秒无缝对比切换；历史记录采用 4 场景智能决策树精确调取。
- **语境化例句练习**：Lookup 模式连通练习题数量设置（`maxExercises`），依据词义生成真实英文例句卡片，引导学习者在真实语境中核对与理解词义。

### 2. 双本地词库与智能路由
- **多词库**：牛津高阶第 9 版中英双解（`lexicon.db`，约 5.2 万）+ 第 10 版纯英英（`lexicon_en.db`，约 8.4 万）。
- **单语热切换**：单词 / 短语可独立开启单语模式，自动在英英与双解间切换并调整排版。
- **中文反向路由与 Core 修复**：输入中文时路由至双解库反向匹配；Pure Core 模式明确寻找地道英文对应词并以母语者心智教授用法。
- **回退保护**：英英库缺失时安全回退双解，避免崩溃。

### 3. AI 增强与个人资产
- Lookup / Core 分轨模组可在 Settings 拖拽排序与开关；随身追问、例句理解核对 / 场景造句练习。
- **UK / US 发音**（含自动发音与离线 TTS 兜底）。
- Lexicon Memory 徽章（只读：笔记 / Core 意象；**不再**显示追问条数徽章，底部 AI Chat 仍可用）；AI 追问按 **Lookup / Pure Core** 分轨保存互不覆盖；设置内 **AI Profile** 诊断（连续追问会聚合后再后台总结，关 App 可冷启动续跑）。个人笔记编辑面板已雪藏，底层记忆数据仍保留。
- 弱项看板 UI 当前**已雪藏**（不占用底栏）；Profile 后端仍可用。

### 4. 介词空间意象
- 覆盖核心隐喻性介词（如 `up` / `out` / `off` 等）的认知拆解。
- 支持单条意象「换一个」局部刷新。

### 5. 漫画 / 截图多图翻译 (Image & Comic Translation)
- **批量导入与并行翻译**：支持一次性选择多张英汉漫画、教材截图或讲义，并行调用 OCR 提取文字与 AI 翻译；包含整体进度与对比预览。
- **平移缩放与放大阅读**：内建高帧率双手指/鼠标滚轮平移与无级缩放查看器，原图与翻译版本秒级叠加切换。
- **导出与分享**：支持生成长图导出与本地存档。

### 6. 网络实时搜索 (Tavily Web Search Integration)
- **实时联网补全**：整合 Tavily AI Search Platform 搜索 API，遇到最新时事词汇、特殊缩写、网络流行语或冷门专业词汇时，AI 可自动检索全球最新网讯进行语境对齐与权威释义。

### 7. 跨平台
- **Web**（WASM SQLite + OCR）、**Windows**（Tauri v2）、**Android / iOS**（Capacitor 8）。

### 导航
底栏 **3 Tab**：**Dict**（查词）/ **Image**（图片）/ **Settings**（全页设置，非抽屉）。外观支持浅色 / 深色 / **跟随系统**。

---

## 📦 下载安装

### Windows
- **[Lexicon_0.9.8_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_x64-setup.exe)**（推荐，NSIS）
- **[Lexicon_0.9.8_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_x64_en-US.msi)**（MSI）

### Android 手机 / 平板 (v0.9.8)
- **[Lexicon_0.9.8_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.9.8/Lexicon_0.9.8_universal_signed.apk)**（推荐）
- 架构分包见 [Releases v0.9.8](https://github.com/jimytao/lexicon/releases/tag/v0.9.8)。
- *安装或更新后若 AI 请求失败，重启 VPN / 代理即可。*

### iOS（自签侧载）
1. 安装 **[Sideloadly](https://sideloadly.io/)**（需官网版 iTunes + iCloud，非微软商店版）。
2. USB 连接 iPhone，解锁并信任电脑。
3. 从 GitHub Releases 下载 `.ipa` 拖入 Sideloadly，用 Apple ID 签名安装。
4. 首次启动前：系统设置 → 通用 → VPN 与设备管理 → 信任你的 Apple ID。

---

## ⚙️ 配置 API Key 与服务指南 (AI & Web Search Setup)

软件首次使用或更换模型服务商时，需要配置对应的 **API Key**。Lexicon 采用原生 OpenAI 兼容协议与 Google Gemini 官方协议，支持绝大部分主流云端 AI 与本地私有化大模型。

### 1. 常见 API 服务商注册与密钥获取（点击超链接直接跳转）

> **💡 模型选择与指导大纲**：大模型更新迭代非常迅速，版本号变化频繁，无须纠结固定的数字版本号。在 Lexicon 查词分析与语言学习场景下，**统一建议优先选择各家平台主打「轻量化、速度快」的小模型系列**（如 `Flash` / `Flash Lite` / `Mini` / `Nano` / `Haiku` / `Small` / `Lightning` 等）。此类轻量小模型生成极速、成本低廉，且逻辑准确度完全能够胜任词汇与句法深度解析。

| AI 服务商 | 官方 API Key 申请平台 | 推荐选择的模型类型系列（无须在意版本数字） |
|-----------|------------------------|--------------------------------------------|
| **Google Gemini** | [Google AI Studio Platform](https://aistudio.google.com/app/apikey) | `Flash` / `Flash Lite` 系列（极速轻量，响应迅捷） |
| **OpenAI (ChatGPT)** | [OpenAI API Platform](https://platform.openai.com/api-keys) | `Mini` / `Nano` / `Luna` 等轻量系列 |
| **DeepSeek** | [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) | `DeepSeek Chat` 轻量高速模型 |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | 聚合全球模型，搜索带有 `Flash` / `Mini` / `Free` 标识的轻量模型 |
| **SiliconFlow (硅基流动)** | [硅基流动 Cloud](https://cloud.siliconflow.cn/account/ak) | 选择 `DeepSeek` / `Qwen` 等托管的轻量免费或高速小模型 |
| **Anthropic (Claude)** | [Anthropic Console](https://console.anthropic.com/settings/keys) | `Haiku` 系列（轻量迅捷） |
| **Moonshot (Kimi)** | [Moonshot 开放平台](https://platform.moonshot.cn/console/api-keys) | `Moonshot` 基础轻量模型 |
| **智谱 GLM** | [智谱 AI 开放平台](https://open.bigmodel.cn/usercenter/apikeys) | `GLM Flash` 轻量极速系列 |
| **零一万物 (Yi)** | [零一万物 API 平台](https://platform.lingyiwanwu.com/apikeys) | `Yi Lightning` / 轻量高速系列 |
| **Groq** | [GroqConsole](https://console.groq.com/keys) | 选择超高速 Llama / Mixtral 轻量推理节点 |
| **xAI (Grok)** | [xAI Console](https://console.x.ai/) | `Grok Mini` 轻量系列 |
| **Perplexity** | [Perplexity API Settings](https://www.perplexity.ai/settings/api) | `Sonar` 基础轻量模型 |
| **Together AI** | [Together AI Settings](https://api.together.xyz/settings/api-keys) | 挑选各开源厂商的 `Small` / `Mini` 托管节点 |
| **Mistral** | [Mistral Console](https://console.mistral.ai/api-keys/) | `Mistral Small` 轻量系列 |
| **Ollama (本地私有大模型)** | [Ollama 官网](https://ollama.com/) | 无需 API Key，下载启动小参数量模型（如 7B/8B/Q4 等）填本地地址即可 |
| **Tavily (网络实时搜索)** | [Tavily AI Search Platform](https://tavily.com/) | 专为 AI 简报与联网查词设计的 Web 搜索 API |

---

### 2. 详细配置步骤（从获取到激活）

#### 步骤一：获取 API Key
1. 点击上方表格中您想使用的厂商链接（如 [Google AI Studio](https://aistudio.google.com/app/apikey) 或 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)）。
2. 登录/注册账号，创建新的 **API Key**（通常格式为 `sk-...` 或 `AIza...`）。
3. 复制生成的 API Key。部分平台（如 OpenAI / DeepSeek）可能需要账号内有余额或充值额度（Top up）。

#### 步骤二：进入 Lexicon 设置面板
1. 打开 Lexicon，点击底栏最右侧的 **Settings** (设置全页 Tab)。
2. 在页面顶部展开 **「AI 服务商与模型 (AI Provider & Model)」** 手风琴项。

#### 步骤三：选择服务商并填写 API Key
1. 在服务商网格中点击选择对应的厂商（例如 `Google Gemini`、`DeepSeek` 或 `OpenRouter`）。若使用第三方中转代理或本地 Ollama，请选择 `自定义 (Custom)` 并填写对应的 Endpoint 接口地址（如 `http://localhost:11434/v1`）。
2. 将复制好的 API Key 粘贴至 **API Key** 输入框内，页面右上角将显示绿色的 `已保存 (Key Saved)` 提示。

#### 步骤四：拉取并选择模型 (Fetch Models)
1. 点击输入框旁边的 **「获取模型 (Fetch Models)」** 按钮。Lexicon 会自动向 API 接口发起实时查询并获取该账号可用的模型列表。
2. 在弹出的模型下拉列表中选择您满意的轻量高速模型（如带 `Flash`、`Mini` 或 `Chat` 标识的模型）。

#### 步骤五：测试连接 (Test Connection)
1. 点击下方高亮的 **「测试连接 (Test Connection)」** 按钮。
2. 系统会发送一次轻量测试请求。当按钮显示测试成功，代表您的 API Key 和模型配置完全正确！回到 Dict 查词页即可享受完整的 AI 深度增强能力。

#### 步骤六：配置 Tavily 网络实时搜索 (可选)
1. 在 **Settings** 页面向下滚动至 **「网络实时搜索 (Web Search)」** 开关。
2. 开启开关，并在出现的输入框中粘贴从 [Tavily AI Search Platform](https://tavily.com/) 获得的 API Key（格式为 `tvly-...`）。
3. 开启后，AI 在进行概念拆解和多角度词汇溯源时，可实时抓取全球最新网讯增强答复。

---

## ⌨️ 技巧

- **Ctrl + Enter**：强制 AI 全量搜索。
- **输入框右侧 AI 图标**：绕过本地词库直接 AI 释义。
- **图片流**：导入多图 → 全部翻译 → 对照阅读 → 导出。
- **清除历史 / 缓存**：在 Settings 页底部操作。

---

## 🛠️ 本地运行

需 [Node.js](https://nodejs.org/) LTS（≥ 18）。

```bash
git clone https://github.com/jimytao/lexicon.git
cd lexicon
npm install
npm run dev
```

浏览器打开终端提示的地址（如 `http://localhost:5173/`）。  
*首次查词会 lazy-load 词库（双解约 30MB+），请稍等。*

---

## ⚙️ 打包

```bash
npm run build
npm run tauri:build
npx cap sync android && cd android && ./gradlew assembleRelease
```

发版与上传门禁见根目录 [`workflow.md`](./workflow.md)；Agent 启动上下文见 [`AGENT.md`](./AGENT.md)。

---

## 🧱 技术栈

- React 18 + TypeScript（strict）· Vite 6 · Tailwind CSS v4 · Zustand  
- sql.js（SQLite WASM）· Tesseract.js · Tauri v2 · Capacitor v8  

---

## License

[MIT](LICENSE)
