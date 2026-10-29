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

- 英汉 / 英越 / 英英三本库可各自缓存，按共享 `resolveDictionaryContext` 的结果路由。
- `mainDictionary` 变化时 invalidate；单词/短语/句子的 Monolingual 开关只改变当前查询的有效目标，不需要卸载词库实例。
- in-flight / epoch / gate 防止换库竞态与双份大文件并行加载。
- `warmupDictionary()` 在 settings hydration 后只预热当前一本。

Capacitor 额外：

- 预置库路径：`public/assets/databases/lexicon.db`、`lexicon_en.db`、`lexicon_vi.db`
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
// scripts/mdx-en-vi-to-sqlite.mjs → public/assets/databases/lexicon_vi.db
```

推荐的 MDX 解析库：`mdict-analysis`（npm）或 Python 的 `readmdict`（先生成 TSV 再用 Node 导入）。

### 释义单元格里的标签与已知转换损伤（2026-10-29）

- `meanings.zh` / `meanings.en` 开头内联语法与语体标签：`[grammar] (labels) 释义`（OALD9 / OALD10），SPDict 为越南语领域标签 `(y học)` 等。UI 不直接显示原文，而是经 `src/utils/meaningLabels.ts` 的 `cleanDictionaryMeaning()` 剥成小标签。
- **修复前基线 `0dcc889` 的旧库损伤**：`lexicon.db` 有 `[[countable]` 双括号、中文释义丢失开头的 `（`（约 1.8 万行）、约 7.7k 行把情景标签译文（如「金融」「足球」）误当成释义（从英文列末尾的完整中文恢复）、英文列末尾重复中文；`lexicon_en.db` 有约 1.5k 条被截断的学科标签 `(music the 6th …`。显示兼容仍保留，供旧版下载资产使用；本地已应用的新库状态见下。
- `db.ops.ts` 的 `lookupWithRunner` 过滤 SPDict 被拆成「义项」的词性头碎片（`& phó từ`、`, số nhiều abaci`）；若某词条全部都是碎片则保留原样，绝不让词条变空。
- 上述为 `0dcc889` 的旧库兼容背景。2026-10-29 核验后已从原始 MDX 在临时目录生成、对比并应用三库：英汉 99,477、英英 112,040、英越 146,901 条义项。无旧词条丢失；完整性检查通过。详见 `12-learner-evidence-audit.md`。

## 词库文件大小估算

| 内容 | 估算大小 |
|------|----------|
| 牛津双解全部词条（约8万词） | ~80MB |
| 仅 suggest 表（word + zhBrief） | ~5MB |
| 压缩后（Brotli） | ~20MB |

建议首次启动时懒加载：先加载 suggest 表（快），用户查词时再按需解压完整词条，或者将完整 db 整体加载（sql.js 支持内存模式）。

### 2026-10-29 重建与标签核验

- `scripts/mdx-to-sqlite.mjs` / `mdx-en-to-sqlite.mjs` / `mdx-en-vi-to-sqlite.mjs` 接收可选输入、输出路径。构建使用 Node 内置 `node:sqlite`（本轮 Node 24.18），App 存储引擎不变。生成输出先放临时目录，经 `scripts/audit-dictionaries.mjs` 只读比对后再应用。禁止把未经比较的数量增加当作已正确转换。
- `scripts/dictionary-entries.mjs` 提供转换用 SQLite 包装和按义项词性拆 entry；沿用现有 schema，不新增运行时迁移。英汉 / 英英的例句也按词性分配，英越无例句词性标记时每词只存一份。
- 英汉空中文释义但英文定义有效时保留英文（aren't），不丢词条、不冒充中文翻译；原始 MDX 不修改。
- 英越继承独立星号段落前的 POS、保留联合词性、复数头只删到下一义项分隔符；保留词义里的“plural of”信息。
- 三库共用运行时标签提取：英汉 / 英英有 countable、uncountable、及物 / 不及物等原始标记，显示为标签并随 UI 本地化。SPDict 不提供统一 countability 信息；不推断或补造，可识别的 số nhiều / định ngữ 等按复数 / 定语本地化，领域术语继续保留越南语。
- 原生随包资产版本升为 `2026-10-29-labels-pos2`，安装新版时重新导入生成库。扩展仍下载 GitHub Release 资产；本轮没有发布新库或修改线上清单，扩展线上旧资产仅得到兼容显示修复，新增义项须后续正式发布。

复查使用 Node 24.18（本轮已验证的版本），三转换器参数依次是原始 MDX 与输出 DB 路径；省略参数会使用脚本默认路径。核验时显式指定临时输出，保留旧库：

```powershell
node scripts/mdx-to-sqlite.mjs "INPUT_ENZH.mdx" "GENERATED_DIR/lexicon.db"
node scripts/mdx-en-to-sqlite.mjs "INPUT_ENEN.mdx" "GENERATED_DIR/lexicon_en.db"
node scripts/mdx-en-vi-to-sqlite.mjs "INPUT_ENVI.mdx" "GENERATED_DIR/lexicon_vi.db"
node --import tsx scripts/audit-dictionaries.mjs "BASELINE_DIR" "GENERATED_DIR" "REPORT.json"
```

以上路径是待替换的占位符；输出目录须已存在。审计工具只读打开新旧三库，报告 SHA-256、quick_check、词条 / 义项 / 例句数、丢失旧词条、标签 / 头碎片和样例。结构扫描不能证明所有词义正确，仍须对照 MDX 与实际界面抽查；本轮报告与备份位置见 `12`。
