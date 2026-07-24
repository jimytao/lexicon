# 03 — 本地词库与数据库设计

## 词库来源

推荐导入以下 MDX 词库（从 freemdict.com 或 pdawiki.com 获取）：

| 词库 | 用途 | 优先级 |
|------|------|--------|
| 牛津高阶英汉双解第9版（OALD9） | 主力释义 + 例句 | 必须 |
| 柯林斯COBUILD双解 | 整句情景释义（情景感强） | 推荐 |
| 词根词缀词源词典（Etymology MDX） | Instant mode 词根参考 | 推荐 |

MDX 文件通过转换脚本生成 SQLite，放入 `public/assets/databases/`（Web fetch 与 Capacitor `copyFromAssets` 共用同一路径）。

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

## Web 实现（sql.js）与 Capacitor 实现（原生 SQLite）

查询语义集中在 `src/services/db.ops.ts`（`suggestWithRunner` / `lookupWithRunner` / `relatedPhrasesWithRunner` / `resolveDictionaryTarget`）。

| 平台 | 适配器 | 引擎 |
|------|--------|------|
| Web / Tauri | `db.web.ts` | sql.js（fetch `/assets/databases/*.db` 进 WASM） |
| Capacitor iOS/Android | `db.native.ts`（双端共用） | `@capacitor-community/sqlite`（`copyFromAssets` 后按页读盘） |

两端适配器共同点：

- 英汉 / 英英两本库可各自缓存，按 `resolveDictionaryTarget` 路由。
- **仅当 `activeDictionary` 真正变化时**才 invalidate；其它设置变更不卸库。
- in-flight / epoch / gate 防止换库竞态与双份大文件并行加载。
- `warmupDictionary()` 在 settings hydration 后只预热当前一本。

Capacitor 额外：

- 预置库路径：`public/assets/databases/lexicon.db`、`lexicon_en.db`
- Preferences key `lexicon.db.asset.version`（与 `LEXICON_ASSET_VERSION`）控制是否 `copyFromAssets(true)`
- 原生初始化失败时，`db.ts` **fallback 到 sql.js**

## 运行时选择实现

```ts
// src/services/db.ts
// isCapacitor() → 动态 import('./db.native')，失败则 fallback import('./db.web')
// 否则 → import('./db.web')
export const db: DBService
export async function warmupDictionary(): Promise<void>
```

## MDX 转换脚本（概要）

```ts
// scripts/mdx-to-sqlite.mjs → public/assets/databases/lexicon.db
// scripts/mdx-en-to-sqlite.mjs → public/assets/databases/lexicon_en.db
```

推荐的 MDX 解析库：`mdict-analysis`（npm）或 Python 的 `readmdict`（先生成 TSV 再用 Node 导入）。

## 词库文件大小估算

| 内容 | 估算大小 |
|------|----------|
| 牛津双解全部词条（约8万词） | ~80MB |
| 仅 suggest 表（word + zhBrief） | ~5MB |
| 压缩后（Brotli） | ~20MB |

建议首次启动时懒加载：先加载 suggest 表（快），用户查词时再按需解压完整词条，或者将完整 db 整体加载（sql.js 支持内存模式）。
