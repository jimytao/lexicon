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
  → 存储层暂用 sql.js，后续可切换 @capacitor-community/sqlite

阶段4：iOS（需要 Mac + Xcode）— 待做
  → npx cap add ios
  → 存储层同 Android
```

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
// src/services/db.ts
import { webDB } from './db.web'

// 平台检测：Capacitor 环境下 window.Capacitor 存在
const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()

// 动态导入避免 web 环境加载 native 依赖
async function loadDB() {
  if (isNative) {
    const { nativeDB } = await import('./db.native')
    return nativeDB
  }
  return webDB
}

export const dbPromise = loadDB()
export const db = webDB   // web 开发时直接用，native 时在 App.tsx 初始化后替换
```

实际使用时在 `App.tsx` 里做一次初始化：

```tsx
// src/App.tsx
useEffect(() => {
  dbPromise.then(resolvedDB => {
    // 通知所有 store 使用 resolvedDB
    // 或者用 React Context 注入
  })
}, [])
```

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
| 词库文件位置 | `public/lexicon.db` | `assets/databases/lexicon.db` | 同 web |
| API 网络请求 | 正常 | 需在 capacitor.config 设置 allowedNavigations | 正常 |
| 键盘遮挡 | 无 | 需 `@capacitor/keyboard` 处理 | 无 |
| 离线状态检测 | `navigator.onLine` | Capacitor Network plugin | `navigator.onLine` |
| 深色模式 | CSS prefers-color-scheme | 同 web | 同 web |
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
