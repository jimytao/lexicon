# Lexicon

**面向中文母语者的英语学习工具** | **English learning tool for Chinese speakers**

不只是翻译，而是真正理解词的语义情景、情感质感、词源脉络。帮你读懂漫画、截图和任意图片中的外语文字。

---

## 下载安装 | Download

### Windows
| 文件 | 说明 |
|------|------|
| `Lexicon_x64-setup.exe` | **推荐**，NSIS 安装包，双击安装 |
| `Lexicon_x64_en-US.msi` | MSI 格式，企业/脚本部署用 |

> 安装后在开始菜单或桌面找到 **Lexicon** 启动。首次启动需配置 API Key（见下方配置说明）。

### Android
| 文件 | 说明 |
|------|------|
| `app-universal-release.apk` | **推荐**，兼容所有架构 |
| `app-arm64-v8a-release.apk` | 仅 64 位 ARM，体积略小 |

> **安装方法**：设置 → 安全 → 允许未知来源，然后打开 APK 文件安装。
> 安装或更新后如 AI 请求失败，重启一下 VPN/代理连接即可。

### iOS
下载 `.ipa` 文件进行侧载（Sideload）安装，支持以下两种免费安装方法（使用个人免费 Apple ID）：

- **方法 1：Sideloadly（推荐，更加稳定）**
  1. 下载并安装 [Sideloadly](https://sideloadly.io/) 客户端（需要非 Microsoft Store 版 iTunes + iCloud）。
  2. iPhone 通过 USB 连接电脑，解锁并选择“信任此电脑”。
  3. 将下载的 `.ipa` 文件拖入 Sideloadly，在 `Apple Account` 输入你的 Apple ID。
  4. 点击 **`Start`**，首次需输入密码及双重验证码，等待安装完成即可（支持 Wi-Fi 自动续签）。
- **方法 2：AltStore**
  1. PC 安装 [AltStore](https://altstore.io/)，并确保安装了官网版的 iTunes + iCloud（非 Microsoft Store 版）。
  2. iPhone 通过 USB 连接电脑并授权，安装 AltStore 客户端到手机。
  3. 下载 `.ipa`，在手机端 AltStore 的 **My Apps** 中点击 **+** 导入安装（需要保持电脑端 AltServer 后台运行且处于同一 Wi-Fi，支持 7 天 Wi-Fi 自动续签）。

> **首次启动说明**：自签安装后如无法打开，需前往 iPhone 的 **设置 → 通用 → VPN 与设备管理**，找到你的 Apple ID 并点击 **“信任”**。

### Web
直接在浏览器访问部署地址，或本地 `npm run dev` 运行。

---

## 功能介绍 | Features

### 词库查词
- 52,000+ 词条，来自 OALD9（牛津高阶英语词典）
- 零延迟即搜即显，支持自动补全、键盘导航
- 释义、例句、相关词组完整呈现
- 搜索历史持久化

### AI 增强模式
配置 API Key 后解锁，L1 词库内容立即显示，AI 板块异步加载：

| 功能 | 说明 |
|------|------|
| **语义情景** | 用中文对话讲解每个义项的使用场景和情感质感 |
| **词根词缀** | 拆解词根/词缀 + 起源故事 + 同源派生词 |
| **近义词辨析** | 相似词之间的细微差别和使用语境 |
| **练习题** | AI 生成情景选择题，实时评分 + 解析 |
| **AI 对话** | 针对当前词随时提问 |
| **拼写纠正** | 自动检测并展示正确拼写 |
| **词组/句子查询** | 不限于单词，粘贴任意词组或句子均可分析 |

### 图片翻译（漫画翻译）
专为漫画、截图、扫描件设计的多图翻译工作流：

**上传与翻译**
- 支持一次上传多张图片
- 点「开始翻译全部」并行翻译所有图片，各自独立进度
- 顶部缩略图条切换图片，绿点 = 已完成，转圈 = 翻译中

**阅读体验**
- 图片滚动到顶部后自动 sticky 吸顶，边看原图边看译文列表
- 切换图片自动跳到图片 sticky 位置，译文列表从第一条开始
- 支持 Ctrl+滚轮缩放，放大后可拖拽平移（未放大时不响应平移）


### 跨平台
- **Web** — 任意现代浏览器
- **Windows** — Tauri 原生桌面，安装包约 5 MB
- **Android** — Capacitor，APK 直装
- **iOS** — Capacitor，Sideloadly / AltStore 签名安装

---

## 配置 API Key | Setup

1. 打开应用，点右上角 ⚙️ 设置图标
2. 选择 AI 服务商（推荐 **Google Gemini** — 有免费额度）
3. 粘贴 API Key（点眼睛图标可切换显示/隐藏）
4. 点「测试连接」验证
5. 搜索词后切换到 **AI mode** 解锁增强分析

**支持的服务商（15+）**：Google Gemini、OpenAI、Anthropic Claude、DeepSeek、Moonshot/Kimi、智谱 GLM、零一万物、SiliconFlow、OpenRouter、xAI/Grok、Perplexity、Mistral、Groq、Together AI、自定义 Endpoint

---

## 使用技巧 | Tips

- **Ctrl+Enter**：在搜索框强制触发 AI 搜索
- **搜索框内 AI 按钮**：强制 AI 查词，搜索结果不满意时用
- **图片翻译快捷流程**：上传图片 → 开始翻译全部 → 阅读列表 → 需要嵌字时点「嵌字此图」→ 调整 → 导出
- **漫画多图**：一次上传全部页面，批量翻译后逐页切换阅读

---

## 本地运行 Web 版 | Run Locally

**前置条件**：安装 [Node.js](https://nodejs.org/) LTS 版本（≥ 18）

```bash
# 1. 克隆仓库
git clone https://github.com/jimytao/lexicon.git
cd lexicon

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

启动后终端会显示本地地址，复制到浏览器打开即可：

```
Local:   http://localhost:5173/   ← 实际端口以终端输出为准
```

> 首次加载会下载约 31 MB 的词库文件（`lexicon.db`），稍等片刻即可搜索。

---

## 本地开发 | Development

```bash
npm run build      # 生产构建（输出到 dist/）

# Windows 桌面（需要 Rust 工具链）
npm run tauri:dev
npm run tauri:build

# Android（需要 Android SDK）
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 技术栈 | Tech Stack

| 层 | 技术 |
|----|------|
| 框架 | React 18 + TypeScript (strict) |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS v4 |
| 状态 | Zustand |
| 数据库 | sql.js（SQLite via WASM）|
| AI | 任意 OpenAI 兼容 API |
| 桌面 | Tauri v2 |
| 移动 | Capacitor v8 |

---

## License

MIT
