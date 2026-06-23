# 03 — 本地词库与数据库设计

## 词库来源

推荐导入以下 MDX 词库（从 freemdict.com 或 pdawiki.com 获取）：

| 词库 | 用途 | 优先级 |
|------|------|--------|
| 牛津高阶英汉双解第9版（OALD9） | 主力释义 + 例句 | 必须 |
| 柯林斯COBUILD双解 | 整句情景释义（情景感强） | 推荐 |
| 词根词缀词源词典（Etymology MDX） | Instant mode 词根参考 | 推荐 |

MDX 文件通过 `scripts/mdx-to-sqlite.ts` 脚本一次性转换为 `lexicon.db`，放入 `public/` 目录，app 启动时加载。

## SQLite Schema

```sql
-- 主词条表
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  word_lower TEXT NOT NULL,       -- 小写，用于搜索
  phonetic TEXT,
  pos TEXT,                       -- noun/verb/adj/adv/phrase
  source TEXT                     -- 'oald' | 'collins' | 'custom'
);

-- 释义表（一词多义）
CREATE TABLE meanings (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES entries(id),
  seq INTEGER,                    -- 序号，1,2,3...
  zh TEXT NOT NULL,               -- 中文释义（带情景前缀）
  en TEXT,                        -- 英文释义
  register TEXT                   -- formal/informal/spoken 等（可空）
);

-- 例句表
CREATE TABLE examples (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES entries(id),
  en TEXT NOT NULL,
  zh TEXT
);

-- 词根词缀表（来自 Etymology 词库）
CREATE TABLE etymology (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES entries(id),
  raw TEXT                        -- 原始词源文本，AI mode 时可用作参考
);

-- 搜索补全用的索引表（轻量，仅存 word + zhBrief）
CREATE TABLE suggest (
  word TEXT PRIMARY KEY,
  zh_brief TEXT                   -- 2-4个中文词，逗号分隔，如"满意；满足感"
);

-- 历史记录
CREATE TABLE history (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL,
  looked_up_at INTEGER NOT NULL   -- Unix timestamp
);

-- 索引
CREATE INDEX idx_word_lower ON entries(word_lower);
CREATE INDEX idx_suggest_prefix ON suggest(word);
```

## 存储层抽象接口

**这是跨平台的核心**。上层组件只调用这个接口，不直接操作 sql.js 或 Capacitor SQLite。

```ts
// src/services/db.ts

export interface DBService {
  /** 前缀搜索（只返回不含空格的单词），最多 limit 条 */
  suggest(prefix: string, limit?: number): Promise<SuggestItem[]>

  /** 精确查找一个词条（含释义、例句） */
  lookup(word: string): Promise<WordResult | null>

  /** 查以 word 开头的短语词组（含空格的 suggest 条目） */
  getRelatedPhrases(word: string, limit?: number): Promise<SuggestItem[]>

  /** 记录查词历史（保留接口，跨平台实现用） */
  addHistory(word: string): Promise<void>

  /** 获取历史记录 */
  getHistory(limit?: number): Promise<string[]>
}

> **注意**：Web 端历史记录实际由 `historyStore`（Zustand persist）维护在 localStorage，
> 不经过 `addHistory`。`DBService.addHistory` 保留供 Capacitor 原生实现使用。
```

## Web 实现（sql.js）

```ts
// src/services/db.web.ts
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import type { DBService } from './db'
import { useSettingsStore } from '../stores/settingsStore'

let db: Database | null = null

// 订阅设置中词典状态的变更，自动断开并重新加载新词典
let lastDb = useSettingsStore.getState().activeDictionary || 'lexicon.db'
useSettingsStore.subscribe((state) => {
  const newDb = state.activeDictionary || 'lexicon.db'
  if (newDb !== lastDb) {
    lastDb = newDb
    if (db) {
      try { db.close() } catch (e) {}
      db = null
    }
  }
})

async function getDb(): Promise<Database> {
  if (db) return db
  const SQL = await initSqlJs({
    locateFile: (file) => `/sql-wasm/${file}`,
  })
  
  // 从 Settings Store 中动态获取激活的本地词库文件名
  const activeDb = useSettingsStore.getState().activeDictionary || 'lexicon.db'
  let response: Response
  try {
    response = await fetch(`/${activeDb}`)
    if (!response.ok && activeDb !== 'lexicon.db') {
      console.warn(`Failed to fetch ${activeDb}, falling back to lexicon.db`)
      response = await fetch('/lexicon.db')
    }
  } catch (err) {
    if (activeDb !== 'lexicon.db') {
      response = await fetch('/lexicon.db')
    } else {
      throw err
    }
  }

  const buffer = await response.arrayBuffer()
  db = new SQL.Database(new Uint8Array(buffer))
  return db
}

export const webDB: DBService = {
  async suggest(prefix, limit = 8) {
    const db = await getDb()
    const results = db.exec(
      `SELECT word, zh_brief FROM suggest
       WHERE word LIKE ? ORDER BY word LIMIT ?`,
      [`${prefix.toLowerCase()}%`, limit]
    )
    if (!results[0]) return []
    return results[0].values.map(([word, zhBrief]) => ({
      word: word as string,
      zhBrief: zhBrief as string,
    }))
  },

  async lookup(word) {
    const db = await getDb()
    // 查主词条
    const entryRes = db.exec(
      `SELECT id, phonetic, pos FROM entries WHERE word_lower = ? LIMIT 1`,
      [word.toLowerCase()]
    )
    if (!entryRes[0]) return null
    const [id, phonetic, pos] = entryRes[0].values[0]

    // 查释义
    const meaningRes = db.exec(
      `SELECT zh, en FROM meanings WHERE entry_id = ? ORDER BY seq`,
      [id]
    )
    const meanings = (meaningRes[0]?.values ?? []).map(([zh, en]) => ({
      zh: zh as string,
      en: en as string,
    }))

    // 查例句
    const exampleRes = db.exec(
      `SELECT en, zh FROM examples WHERE entry_id = ? LIMIT 4`,
      [id]
    )
    const examples = (exampleRes[0]?.values ?? []).map(([en, zh]) => ({
      en: en as string,
      zh: zh as string,
    }))

    return { word, phonetic: phonetic as string, pos: pos as string, meanings, examples }
  },

  async addHistory(word) {
    const db = await getDb()
    db.run(
      `INSERT INTO history(word, looked_up_at) VALUES(?, ?)`,
      [word, Date.now()]
    )
  },

  async getHistory(limit = 20) {
    const db = await getDb()
    const res = db.exec(
      `SELECT DISTINCT word FROM history ORDER BY looked_up_at DESC LIMIT ?`,
      [limit]
    )
    return (res[0]?.values ?? []).map(([w]) => w as string)
  },
}
```

## 运行时选择实现

```ts
// src/services/db.ts（入口，根据平台选择实现）
import { webDB } from './db.web'
// import { nativeDB } from './db.native'  // Capacitor 版，后续接入

export const db: DBService = webDB
// 移动端时改为：export const db: DBService = nativeDB
```

## MDX 转换脚本（概要）

```ts
// scripts/mdx-to-sqlite.ts
// 运行方式：npx tsx scripts/mdx-to-sqlite.ts --input ./oald9.mdx --output ./public/lexicon.db

// 步骤：
// 1. 用 mdict-analysis 或 readmdict 库解析 MDX 二进制格式
// 2. 提取 word + HTML 定义
// 3. 用 cheerio 解析 HTML，提取 zh/en 释义、例句、音标、词性
// 4. 写入 SQLite（用 better-sqlite3，Node 环境）
// 5. 构建 suggest 表：取第一条释义的前几个中文词

// 注意：这个脚本只在开发机上跑一次，生成的 lexicon.db 提交到 public/ 目录
// 不要把 MDX 原文件放进 repo（版权问题）
```

推荐的 MDX 解析库：`mdict-analysis`（npm）或 Python 的 `readmdict`（先生成 TSV 再用 Node 导入）。

## 词库文件大小估算

| 内容 | 估算大小 |
|------|----------|
| 牛津双解全部词条（约8万词） | ~80MB |
| 仅 suggest 表（word + zhBrief） | ~5MB |
| 压缩后（Brotli） | ~20MB |

建议首次启动时懒加载：先加载 suggest 表（快），用户查词时再按需解压完整词条，或者将完整 db 整体加载（sql.js 支持内存模式）。
