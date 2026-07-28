# 06 — 跨平台方案（Capacitor + Tauri）

## 总体策略

Web（Vite + React）是唯一的代码基础，跨平台只是"包装层"。
存储层（db.ts）是唯一需要按平台切换的地方。

```
Vite + React（核心，不改动）
    ├── Capacitor → Android .apk / iOS .ipa
    └── Tauri    → Windows .exe / macOS .app / Linux
```

## 开发顺序与当前状态

```
阶段1：Web 版 ✅ 已完成
  → npm run dev，浏览器调试
  → sql.js WASM 词库

阶段2：PC（Tauri） ✅ 已完成（2026-04-09）
  → src-tauri/ 已初始化，Tauri v2
  → npm run tauri:dev / npm run tauri:build
  → 输出 exe（NSIS 安装包）+ msi
  → 存储层继续用 sql.js（WASM 在 WebView2 正常工作）

阶段3：Android（Capacitor） ✅ 已完成（2026-04-09）
  → android/ 已初始化，Capacitor v7
  → npx cap sync android + Gradle assembleDebug
  → 输出 app-debug.apk（19MB）
  → 存储层：@capacitor-community/sqlite（db.native.ts，与 iOS 共用）；失败 fallback sql.js
  → 词库：public/assets/databases/*.db → copyFromAssets

阶段4：iOS（GitHub Actions + Sideloadly，无需 Mac）✅ 已配置（2026-04-11）
  → ios/ 已初始化，Capacitor v8，SPM（非 CocoaPods）
  → 构建：GitHub Actions macOS runner 自动编译 → 输出未签名 .ipa
  → 安装：Sideloadly（Windows/Mac）用免费 Apple ID 签名并推送到手机
  → 触发：推 tag（v*）自动构建；或 Actions 页面手动 workflow_dispatch
  → 存储层：@capacitor-community/sqlite（db.native.ts，与 iOS 共用）；失败 fallback sql.js
  → 词库：public/assets/databases/*.db → copyFromAssets
```

## iOS 构建流程（无 Mac 方案）

### 工作原理

| 环节 | 工具 | 费用 |
|------|------|------|
| 编译 IPA | GitHub Actions macOS runner | 免费（私有库 2000 min/月，公开库无限） |
| 安装到手机 | Sideloadly for Windows/Mac + 免费 Apple ID | 免费 |
| 证书续签 | Sideloadly 手动/Wi-Fi 自动（7天/次） | 免费 |

### 触发构建

```bash
# 打 tag 自动触发
git tag v0.2.0
git push origin v0.2.0

# 或在 GitHub → Actions → iOS Build → Run workflow 手动触发
```

构建完成后 IPA 文件在：
- GitHub Actions → Artifacts（保留 30 天）
- GitHub Release（打 tag 时自动上传）

### 安装到 iPhone

1. PC 安装 [Sideloadly](https://sideloadly.io)（需要非 Microsoft Store 版 iTunes + iCloud）
2. iPhone 通过 USB 连接到 PC，并解锁手机选择“信任此电脑”
3. 打开 Sideloadly，将下载的 `.ipa` 文件拖入 Sideloadly 中
4. 在 `Apple Account` 输入你的 Apple ID，点击 `Start`
5. 首次使用需要输入 Apple ID 密码（以及双重验证码），随后等待签名安装完成即可

### 限制与续签

- 免费 Apple ID：同时最多 3 个 App（个人使用足够）
- 证书 7 天到期：需每 7 天重新连接电脑打开 Sideloadly 覆盖安装，或配置 Sideloadly 的 Automatic Refresh（需电脑常驻 Sideloadly 且手机处于同一 Wi-Fi）

### 关键文件

- `.github/workflows/ios-build.yml` — GitHub Actions 构建配置
- `ios/ExportOptions.plist` — xcodebuild 导出配置（无签名）
- `ios/App/App.xcodeproj` — Xcode 项目（Capacitor 8 使用 SPM，非 xcworkspace）

---

## Capacitor 接入步骤（Android 为例）

```bash
# 安装
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor-community/sqlite

# 初始化
npx cap init Lexicon com.julian.lexicon --web-dir dist

# 构建 web 产物
npm run build

# 添加 Android 平台
npx cap add android
npx cap sync

# 打开 Android Studio 或直接运行
npx cap run android
```

### capacitor.config.ts

```ts
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.julian.lexicon',
  appName: 'Lexicon',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      androidIsEncryption: false,
    },
  },
}

export default config
```

## 移动端存储层实现

```ts
// src/services/db.native.ts
// 在阶段2接入时创建此文件

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { DBService } from './db'

const sqlite = new SQLiteConnection(CapacitorSQLite)
let db: any = null

async function getDb() {
  if (db) return db
  // 首次运行：从 assets 复制预构建词库
  const ret = await sqlite.checkConnectionsConsistency()
  const isConn = (await sqlite.isConnection('lexicon', false)).result
  if (!isConn) {
    db = await sqlite.createConnection('lexicon', false, 'no-encryption', 1, false)
    await db.open()
    // 如果是新安装，从 bundled assets 导入 lexicon.db
    // （将 lexicon.db 放在 android/app/src/main/assets/databases/）
  } else {
    db = await sqlite.retrieveConnection('lexicon', false)
  }
  return db
}

export const nativeDB: DBService = {
  async suggest(prefix, limit = 8) {
    const db = await getDb()
    const res = await db.query(
      `SELECT word, zh_brief FROM suggest WHERE word LIKE ? ORDER BY word LIMIT ?`,
      [`${prefix.toLowerCase()}%`, limit]
    )
    return res.values ?? []
  },

  async lookup(word) {
    const db = await getDb()
    // 逻辑同 db.web.ts，SQL 语句完全相同
    // ...（省略，结构与 web 版一致）
  },

  async addHistory(word) {
    const db = await getDb()
    await db.run(
      `INSERT INTO history(word, looked_up_at) VALUES(?, ?)`,
      [word, Date.now()]
    )
  },

  async getHistory(limit = 20) {
    const db = await getDb()
    const res = await db.query(
      `SELECT DISTINCT word FROM history ORDER BY looked_up_at DESC LIMIT ?`,
      [limit]
    )
    return (res.values ?? []).map((r: any) => r.word)
  },
}
```

## 存储层切换机制

```ts
// src/services/db.ts（已落地）
// Capacitor → 动态 import db.native（@capacitor-community/sqlite）
// 失败或非 Capacitor → db.web（sql.js）
// 查询语义共用 db.ops.ts
```

词库文件统一放在 `public/assets/databases/`，构建后进入 `dist/assets/databases/`，供：

- Web：`fetch('/assets/databases/lexicon.db')`
- Capacitor：`SQLiteConnection.copyFromAssets()`（插件约定目录）

同步原生工程：

```bash
npm run build
npx cap sync
```

### 冒烟清单

- Android：冷启动 → 搜 `satisfaction` → 切设置拨深色 → 回 Dict（应仍秒开，不应整库重灌 JS）
- iOS：同上；再手动切换英英/英汉词典各查一词
- Web：回归联想 + 精确查词 + 中文反查；Network 可见 `/assets/databases/*.db`

## Tauri 接入（PC 端）

```bash
npm install --save-dev @tauri-apps/cli @tauri-apps/api
npx tauri init

# 修改 tauri.conf.json
# devUrl: "http://localhost:5173"
# frontendDist: "../dist"

npm run tauri dev    # 开发
npm run tauri build  # 打包
```

PC 端可以继续用 sql.js（WASM 在 Tauri webview 里正常工作），无需替换存储层。
如果未来需要从 OS 文件系统加载更大词库，可以换 `tauri-plugin-sql`，接口设计相同。

### tauri.conf.json 关键配置

```json
{
  "app": {
    "windows": [{
      "label": "main",
      "title": "Lexicon",
      "width": 420,
      "height": 720,
      "resizable": true,
      "minWidth": 360,
      "minHeight": 600
    }]
  },
  "bundle": {
    "identifier": "com.julian.lexicon",
    "icon": ["icons/icon.png"]
  }
}
```

## 各平台差异汇总

| 问题 | Web | Android/iOS（Capacitor） | PC（Tauri） |
|------|-----|-------------------------|------------|
| SQLite | sql.js WASM | @capacitor-community/sqlite | sql.js 或 tauri-plugin-sql |
| 词库文件位置 | `public/assets/databases/lexicon.db` | 同左（copyFromAssets） | 同 web |
| API 网络请求 | 正常 | 需在 capacitor.config 设置 allowedNavigations | 正常 |
| 键盘遮挡 | 无 | 需 `@capacitor/keyboard` 处理 | 无 |
| 离线状态检测 | `navigator.onLine` | Capacitor Network plugin | `navigator.onLine` |
| 外观 / 深色 | class-based `.dark`；`appearance: light\|dark\|system` + `matchMedia`（见 `research/system-appearance-crossplatform.md`） | 同 web；Android DayNight、勿 algorithmic force-dark；iOS 勿 plist 强制 Appearance | 同 web；Tauri `setTheme` 对齐窗口铬 |
| 应用图标 | favicon | Android/iOS 图标资源 | Tauri icons/ |

## AI 请求的跨平台注意

Capacitor 的 webview 在 Android 上有时会拦截 HTTPS 请求（证书问题）。如果 AI API 调用失败，检查：

```json
// capacitor.config.ts
{
  "server": {
    "allowNavigation": [
      "generativelanguage.googleapis.com",
      "api.anthropic.com",
      "api.openai.com"
    ]
  }
}
```

iOS 的 ATS（App Transport Security）要求所有请求使用 HTTPS，所有主流 AI API 都满足，无需额外配置。
