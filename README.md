# Lexicon

**面向中文母语者的下一代英语深度学习工具** | **[English Version](./README_en.md)**

不只是查词翻译，而是通过双本地词库、认知语言学介词空间隐喻、多语域文化背景以及 AI 异步增强分析，帮助你真正理解英语单词的语义情景、情感质感与词源脉络。

---

## 🚀 核心特性

### 1. 三种查词模式
- **Instant**：纯本地词库，零延迟，离线可用（切回 Instant 只显示 L1，AI 缓存保留）。
- **AI Lookup**：理解与记忆——L1 立即呈现；轻量意象、词根、助记、例句、介词意象、释义核对练习与 Chat 异步淡入。
- **Pure Core**：母语者用法——用法意象（含感觉锚/情绪底色）、概念树、介词语组/其他词组（尾缀类词可空）、近义与**选用对照**、用法场景、语域与造句练习（无释义墙；模组均可拖拽排序）。
- **词组/句子**：短词组 Meaning 只留短释义；情景与母语选用意图在 **Usage Contexts**（含开场白）；超长订正标题与「为什么这么改」各自独立折叠。
- 顶部模式切换**点击即生效**（有缓存恢复，无缓存立刻发起对应查询）；历史列表双星区分 Lookup / Core 轨。

### 2. 双本地词库与智能路由
- **多词库**：牛津高阶第 9 版中英双解（`lexicon.db`，约 5.2 万）+ 第 10 版纯英英（`lexicon_en.db`，约 8.4 万）。
- **单语热切换**：单词 / 短语可独立开启单语模式，自动在英英与双解间切换并调整排版。
- **中文反向路由**：输入中文时路由至双解库做反向匹配，命中后与英文主体、AI 分析与缓存对齐。
- **回退保护**：英英库缺失时安全回退双解，避免崩溃。

### 3. AI 增强与个人资产
- Lookup / Core 分轨模组可在 Settings 拖拽排序与开关；随身追问、释义核对 / 场景造句练习。
- **UK / US 发音**（含自动发音与离线 TTS 兜底）。
- Lexicon Memory 徽章（只读：笔记 / Core 意象；**不再**显示追问条数徽章，底部 AI Chat 仍可用）；AI 追问按 **Lookup / Pure Core** 分轨保存互不覆盖；设置内 **AI Profile** 诊断。个人笔记编辑面板已雪藏，底层记忆数据仍保留。
- 弱项看板 UI 当前**已雪藏**（不占用底栏）；Profile 后端仍可用。

### 4. 介词空间意象
- 覆盖核心隐喻性介词（如 `up` / `out` / `off` 等）的认知拆解。
- 支持单条意象「换一个」局部刷新。

### 5. 漫画 / 截图多图翻译
- 批量导入、并行翻译与进度；对照阅读、缩放平移；嵌字精细调整后导出。

### 6. 跨平台
- **Web**（WASM SQLite + OCR）、**Windows**（Tauri v2）、**Android / iOS**（Capacitor 8）。

### 导航
底栏 **3 Tab**：**Dict**（查词）/ **Image**（图片）/ **Settings**（全页设置，非抽屉）。

---

## 📦 下载安装

### Windows
- **[Lexicon_0.8.9_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.8.9/Lexicon_0.8.9_x64-setup.exe)**（推荐，NSIS）
- **[Lexicon_0.8.9_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.8.9/Lexicon_0.8.9_x64_en-US.msi)**（MSI）

### Android
- **[Lexicon_0.8.9_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.8.9/Lexicon_0.8.9_universal_signed.apk)**（推荐）
- 架构分包见 [Releases v0.8.9](https://github.com/jimytao/lexicon/releases/tag/v0.8.9)。
- *安装或更新后若 AI 请求失败，重启 VPN / 代理即可。*

### iOS（自签侧载）
1. 安装 **[Sideloadly](https://sideloadly.io/)**（需官网版 iTunes + iCloud，非微软商店版）。
2. USB 连接 iPhone，解锁并信任电脑。
3. 从 GitHub Releases 下载 `.ipa` 拖入 Sideloadly，用 Apple ID 签名安装。
4. 首次启动前：系统设置 → 通用 → VPN 与设备管理 → 信任你的 Apple ID。

---

## ⚙️ 配置 AI

1. 打开底栏 **Settings**。
2. 在 **App Language** 切换中文 / 英文界面。
3. 选择服务商（推荐 **Google Gemini**），粘贴 **API Key**，点 **Test Connection**。
4. 回到 Dict，将顶部模式切到 **AI Lookup** 或 **Pure Core** 即可使用大模型能力。

> **支持**：Google Gemini、OpenAI、Anthropic Claude、DeepSeek、Moonshot/Kimi、智谱 GLM、零一万物、SiliconFlow、OpenRouter、xAI/Grok、Perplexity、Mistral、Groq、Together AI、自定义 Endpoint。

---

## ⌨️ 技巧

- **Ctrl + Enter**：强制 AI 全量搜索。
- **输入框右侧 AI 图标**：绕过本地词库直接 AI 释义。
- **图片流**：导入多图 → 全部翻译 → 对照阅读 → 嵌字调整 → 导出。
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
