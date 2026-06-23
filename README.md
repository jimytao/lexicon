# Lexicon

**面向中文母语者的下一代英语深度学习工具**

不只是查词翻译，而是通过双本地词库、认知语言学介词空间隐喻、多语域文化背景以及 AI 异步增强分析，帮助你真正理解英语单词的语义情景、情感质感与词源脉络。

---

## 🚀 核心特性 (Key Features)

### 1. 双本地词库与细粒度智能路由器
- **多词库搭载**：内置包含 5.2 万词条的 **牛津高阶第 9 版中英双解词典 (`lexicon.db`)** 与 8.4 万词条的 **牛津高阶第 10 版纯英英词典 (`lexicon_en.db`)**。
- **动态自动切换**：支持针对“单词”和“短语”细粒度独立开启单语模式。系统会根据查询实体类型自动在英英/双解词库间热重载切换，并在英英模式下自动重构排版、隐藏重复中文。
- **中文反向智能路由**：输入中文（如“跑”）时，路由器会自动拦截并路由至双解词典进行反向模糊匹配，成功匹配后（如映射到 "run"），后续的词典页面、AI 深度分析与缓存全部与英文单词主体精准绑定，彻底解决中文直喂 AI 导致的生成错乱。
- **回退容错保护**：若英英词库文件尚未下载或缺失，加载时会自动安全回退至双语词典，确保应用绝不崩溃。

### 2. AI 异步增强分析
本地词典（L1）秒级呈现，AI 分析（L2）异步加载，提供全方位的认知建构：
- **语义情景**：用口语化中文对话解释义项在何种场景下发生、有何种情感色彩。
- **词根词缀**：深度拆解每个单词的词根、前缀、后缀，提供原始拉丁/希腊语源、记忆故事以及派生词网络。
- **近义/反义词辨析**：对比 3-5 个同义/反义词，一句话点明语境和强度的细微差别。
- **语块与搭配 (Chunks & Collocations)**：生成 4-6 个常用动介/名介语块及自然固定搭配，支持悬停 Tooltip 浮窗阅读用法说明。
- **文化背景与语域 (Cultural Lore)**：精准标记词汇的社会语域（正式/口语/俚语/专业/中性等），补充流行度与文化典故。
- **AI 随身聊天室**：针对当前查询的词汇，随时向 AI 发起对话，突破静态词典的局限。
- **情景练习题 (Practice)**：AI 针对所查词义生成定制的情景单选题，支持实时作答、评分与解析。

### 3. 认知语言学介词空间意象 (Preposition Spatial Imagery)
- 针对英语中 13 个最核心的隐喻性介词（如 `up`, `out`, `off`, `on`, `over`, `in` 等）进行认知隐喻剖析。
- 以直观的文字和认知模型，拆解介词如何在短语中对整词含义进行“空间塑形”，帮助您摆脱死记硬背。
- 支持单条介词意象局部「换一个」的异步局部更新。

### 4. 专为漫画/截图设计的多图翻译工作流
- **批量翻译**：支持一次性导入多张图片，并行翻译并显示独立进度。
- **多图阅读体验**：图片滚动到顶部后自动吸顶，支持边对照原图边浏览译文。支持 Ctrl+鼠标滚轮无级缩放及平移拖拽。

### 5. 极致跨平台体验
- **Web 端** — 现代浏览器即开即用（采用 WASM 加载 SQLite 与 OCR 引擎）。
- **Windows 桌面版** — 采用 Tauri v2 驱动，原生系统打包，安装包仅约 5 MB，运行极其流畅。
- **Android 移动端** — 采用 Capacitor 构建，提供 Universal 签名 APK，针对不同 CPU 架构做了打包优化。
- **iOS 移动端** — 采用 Capacitor 构建，推荐使用 Sideloadly 客户端通过个人免费 Apple ID 自签侧载安装，支持 Wi-Fi 续签。

---

## 📦 下载安装 (Download)

### Windows
- **[Lexicon_0.7.25_x64-setup.exe](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_x64-setup.exe)**（推荐，NSIS 安装包，双击安装）
- **[Lexicon_0.7.25_x64_en-US.msi](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_x64_en-US.msi)**（MSI 格式，企业或自动化脚本部署用）

### Android
- **[Lexicon_0.7.25_universal_signed.apk](https://github.com/jimytao/lexicon/releases/download/v0.7.25/Lexicon_0.7.25_universal_signed.apk)**（推荐，兼容所有主流安卓机型）
- 如果想使用更轻量化的架构分包，可前往 [Releases 页面](https://github.com/jimytao/lexicon/releases/tag/v0.7.25) 下载对应的 `arm64-v8a` 或 `armeabi-v7a` 版本。
*注：安装或更新后如遇到 AI 服务请求失败，重启一下 VPN 或代理工具即可。*

### iOS (自签侧载)
1. 电脑端下载并安装 **[Sideloadly](https://sideloadly.io/)** 客户端（请确保安装了官方渠道的非微软商店版 iTunes 和 iCloud）。
2. 将 iPhone 用 USB 连接至电脑，解锁手机并在弹出的对话框中选择“信任此电脑”。
3. 在 GitHub Releases 下载 `.ipa` 包并拖入 Sideloadly。
4. 在 `Apple Account` 输入您的 Apple ID，点击 **`Start`**。首次安装需输入密码及双重验证码，等待安装成功即可。
5. 首次启动前，需要在 iPhone 前往 **设置 → 通用 → VPN 与设备管理**，找到你的 Apple ID 并点击 **“信任”**。

---

## ⚙️ 配置 AI 助教 (Setup AI Provider)

1. 点击右上角 ⚙️ **设置** 图标。
2. 在 **App Language** 中可切换中文/英文界面。
3. 选择您信任的 AI 服务商（极力推荐 **Google Gemini** — 响应迅速且提供充裕的免费额度）。
4. 在对应输入框内粘贴您的 **API Key**（点击眼睛图标可切换明文显示）。
5. 点击 **“测试连接 (Test Connection)”** 确认验证通过。
6. 返回主页，在查词时将顶部的查词模式切换为 **AI mode**，即可解锁大模型深度词汇剖析。

> **支持的服务商**：Google Gemini、OpenAI、Anthropic Claude、DeepSeek、Moonshot/Kimi、智谱 GLM、零一万物、SiliconFlow、OpenRouter、xAI/Grok、Perplexity、Mistral、Groq、Together AI、以及自定义 Endpoint。

---

## ⌨️ 快捷操作技巧 (Tips)

- **Ctrl + Enter**：在搜索输入框中，直接强制触发 AI 全量搜索。
- **输入框右侧 AI 图标**：若对本地词典结果不满意，点击可强制绕过本地词库进行 AI 释义。
- **图片翻译高效流**：导入多图 → 点击“开始翻译全部” → 批量对照阅读 → 选中单图点击“嵌字此图”进行精细调整 → 导出。
- **清除历史/缓存**：在设置页底部可一键逐出或清理本地的 AI Result 缓存与历史记录，保障个人隐私。

---

## 🛠️ 本地运行 Web 版 (Run Locally)

**前置条件**：系统需安装 [Node.js](https://nodejs.org/) LTS 版本（建议 ≥ 18）。

```bash
# 1. 克隆本仓库
git clone https://github.com/jimytao/lexicon.git
cd lexicon

# 2. 安装依赖包
npm install

# 3. 运行本地开发服务器
npm run dev
```

在浏览器打开终端输出的地址（如 `http://localhost:5173/`）即可。
*注：首次搜索时，前端会自动 lazy-load 下载放在 `public/` 下的词库文件（如双解词库 `lexicon.db` 约 32.8MB），请耐心等待几秒。*

---

## ⚙️ 跨平台编译与打包 (Build Platforms)

```bash
# Web 生产环境打包
npm run build

# Windows 桌面端（需要本地配置有 Rust 开发环境）
npm run tauri:build

# Android 移动端（需要配置有 Android SDK）
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 🧱 技术栈 (Tech Stack)

- **核心框架**：React 18 + TypeScript (Strict 严格模式)
- **构建工具**：Vite 6
- **样式方案**：Tailwind CSS v4 (原生级性能)
- **状态管理**：Zustand
- **本地存储**：sql.js (SQLite WASM 引擎)
- **OCR 识别**：Tesseract.js (WASM 图片文字提取)
- **桌面外壳**：Tauri v2
- **移动外壳**：Capacitor v8

---

## License

[MIT](LICENSE)
