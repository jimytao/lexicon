/**
 * MDX → SQLite 词库转换脚本
 * 用法：node scripts/mdx-to-sqlite.mjs
 *
 * 输入：OALD9 MDX 文件
 * 输出：public/assets/databases/lexicon.db（SQLite，供 sql.js / Capacitor SQLite 加载）
 */

import { MDX } from 'js-mdict'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

// ── 配置 ──────────────────────────────────────────────────────────────────────
const MDX_PATH = "D:/vibe coding/牛津高阶英汉双解词典（第9版）- 带高清版图片/牛津高阶英汉双解词典（第9版）- 带高清版图片/牛津高阶英汉双解词典（第9版）.mdx"
const DB_PATH  = "D:/vibe coding/lexicon/public/assets/databases/lexicon.db"
const BATCH    = 500   // 每批写入条数
// ─────────────────────────────────────────────────────────────────────────────

// 修复 js-mdict 读取 OALD9 时的 surrogate 编码问题
function fixSurrogates(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c >= 0xdc00 && c <= 0xdcff) {
      bytes.push(c - 0xdc00)
    } else if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const lo = str.charCodeAt(++i)
      const cp = 0x10000 + (c - 0xd800) * 0x400 + (lo - 0xdc00)
      bytes.push(0xf0|(cp>>18), 0x80|((cp>>12)&0x3f), 0x80|((cp>>6)&0x3f), 0x80|(cp&0x3f))
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

// 规范化词性标签
function normalizePos(raw) {
  const s = raw.toLowerCase().replace(/\./g, '').trim()
  if (s.includes('noun') || s === 'n') return 'noun'
  if (s.includes('verb') || s === 'v') return 'verb'
  if (s.includes('adj') || s === 'a') return 'adj'
  if (s.includes('adv')) return 'adv'
  if (s.includes('phrase') || s.includes('phr')) return 'phrase'
  return s || 'noun'
}

// 从 OALD9 HTML 提取结构化数据
function parseEntry(word, rawDef) {
  const html = fixSurrogates(rawDef)

  // 音标（取第一个 <phon> 里的内容，去掉斜杠外层残留）
  const phonMatch = html.match(/<phon[^>]*>(.*?)<\/phon>/)
  let phonetic = phonMatch ? stripTags(phonMatch[1]) : ''
  if (phonetic && !phonetic.startsWith('/')) phonetic = '/' + phonetic
  if (phonetic && !phonetic.endsWith('/')) phonetic = phonetic + '/'

  // 词性（取第一个 <pos>）
  const posMatch = html.match(/<pos[^>]*>(.*?)<\/pos>/s)
  const pos = posMatch ? normalizePos(stripTags(posMatch[1])) : 'noun'

  // 释义：从 <sn-g> 中提取 <def>（EN）和紧跟的 <chn>（ZH）
  const meanings = []
  const snMatches = [...html.matchAll(/<sn-g[^>]*>(.*?)(?=<sn-g |<\/sn-blk>|<\/h-g>)/gs)]
  for (const sm of snMatches) {
    const block = sm[1]
    const defMatch = block.match(/<def[^>]*>(.*?)<\/def>/s)
    // chn 紧跟在 def 之后（可能在 def 外的 sn-g 范围内）
    const chnMatch = block.match(/<chn>(.*?)<\/chn>/s)
    if (defMatch && chnMatch) {
      let prefix = ''
      const gramMatch = block.match(/<gram[^>]*>(.*?)<\/gram>/s)
      if (gramMatch) {
        prefix += `[${stripTags(gramMatch[1])}] `
      }
      const regMatch = block.match(/<reg[^>]*>(.*?)<\/reg>/s)
      if (regMatch) {
        prefix += `(${stripTags(regMatch[1])}) `
      }

      const en = prefix + stripTags(defMatch[1])
      const zh = prefix + stripTags(chnMatch[1]).replace(/^[^\u4e00-\u9fff]*/, '') // 去掉前导符号
      if (en && zh) meanings.push({ en, zh })
    }
  }

  // 例句：从 <x-g-blk> 提取英文 <x> 和中文 <chn>
  const examples = []
  const exMatches = [...html.matchAll(/<x-g-blk[^>]*>(.*?)<\/x-g-blk>/gs)]
  for (const em of exMatches) {
    const block = em[1]
    const xMatch = block.match(/<x[^>]*>(.*?)<\/x>/s)
    const chnMatch = block.match(/<chn>(.*?)<\/chn>/s)
    if (xMatch && chnMatch) {
      const en = stripTags(xMatch[1]).replace(/^◆\s*/, '').replace(/\s+[\u4e00-\u9fff].*$/, '').trim()
      const zh = stripTags(chnMatch[1]).replace(/^[^\u4e00-\u9fff]*/, '').trim()
      if (en && zh && en.length > 3) examples.push({ en, zh })
    }
  }

  return { word, phonetic, pos, meanings, examples: examples.slice(0, 6) }
}

function getDefinitionResolved(mdx, word, depth = 0) {
  if (depth > 5) return null // prevent infinite loops
  const result = mdx.lookup(word)
  if (!result?.definition) return null
  
  const def = result.definition.trim()
  if (def.startsWith('@@@LINK=')) {
    const target = def.substring(8).trim()
    return getDefinitionResolved(mdx, target, depth + 1)
  }
  return def
}

// ── 主程序 ────────────────────────────────────────────────────────────────────

console.log('📖 Loading MDX file...')
const mdx = new MDX(MDX_PATH)

const total = mdx.keywordList?.length ?? 0
console.log(`📊 Total entries: ${total.toLocaleString()}`)

// 准备输出目录
const dbDir = dirname(DB_PATH)
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

// 删除旧 DB
if (existsSync(DB_PATH)) {
  console.log('🗑  Removing old database...')
  unlinkSync(DB_PATH)
}

const db = new Database(DB_PATH)

// WAL 模式 + 关闭同步，大幅提速
db.pragma('journal_mode = WAL')
db.pragma('synchronous = OFF')
db.pragma('cache_size = 10000')

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY,
    word TEXT NOT NULL,
    word_lower TEXT NOT NULL,
    phonetic TEXT,
    pos TEXT,
    source TEXT DEFAULT 'oald'
  );

  CREATE TABLE IF NOT EXISTS meanings (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER REFERENCES entries(id),
    seq INTEGER,
    zh TEXT NOT NULL,
    en TEXT
  );

  CREATE TABLE IF NOT EXISTS examples (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER REFERENCES entries(id),
    en TEXT NOT NULL,
    zh TEXT
  );

  CREATE TABLE IF NOT EXISTS suggest (
    word TEXT PRIMARY KEY,
    zh_brief TEXT
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY,
    word TEXT NOT NULL,
    looked_up_at INTEGER NOT NULL
  );
`)

// 预编译语句
const insertEntry   = db.prepare(`INSERT INTO entries(word, word_lower, phonetic, pos, source) VALUES(?,?,?,?,?)`)
const insertMeaning = db.prepare(`INSERT INTO meanings(entry_id, seq, zh, en) VALUES(?,?,?,?)`)
const insertExample = db.prepare(`INSERT INTO examples(entry_id, en, zh) VALUES(?,?,?)`)
const insertSuggest = db.prepare(`INSERT OR IGNORE INTO suggest(word, zh_brief) VALUES(?,?)`)

const batchInsert = db.transaction((entries) => {
  for (const e of entries) {
    // 跳过空词条（纯短语/特殊格式词条过滤掉大部分噪音）
    if (!e.word || e.word.length > 60 || e.meanings.length === 0) continue
    // 只收录英文词汇（排除全汉字词条）
    if (/^[\u4e00-\u9fff]/.test(e.word)) continue

    const info = insertEntry.run(e.word, e.word.toLowerCase(), e.phonetic, e.pos, 'oald')
    const entryId = info.lastInsertRowid

    e.meanings.forEach((m, i) => insertMeaning.run(entryId, i + 1, m.zh, m.en))
    e.examples.forEach(ex => insertExample.run(entryId, ex.en, ex.zh))

    // suggest：取前两条释义的中文，拼成简短提示
    const brief = e.meanings.slice(0, 2).map(m => m.zh.slice(0, 10)).join('；')
    if (brief) insertSuggest.run(e.word.toLowerCase(), brief)
  }
})

// ── 遍历全词库 ────────────────────────────────────────────────────────────────
let batch = []
let processed = 0
let written = 0
let errors = 0
const startTime = Date.now()

const keywords = mdx.keywordList ?? []

for (const kw of keywords) {
  try {
    const resolvedDef = getDefinitionResolved(mdx, kw.keyText)
    if (!resolvedDef) { processed++; continue }

    const entry = parseEntry(kw.keyText, resolvedDef)
    batch.push(entry)
    processed++

    if (batch.length >= BATCH) {
      batchInsert(batch)
      written += batch.length
      batch = []

      if (written % 5000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const pct = ((processed / total) * 100).toFixed(1)
        console.log(`  ${pct}% | ${written.toLocaleString()} written | ${elapsed}s`)
      }
    }
  } catch (e) {
    errors++
  }
}

// 写入剩余
if (batch.length > 0) {
  batchInsert(batch)
  written += batch.length
}

// 建索引
console.log('🔨 Building indexes...')
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_word_lower ON entries(word_lower);
  CREATE INDEX IF NOT EXISTS idx_suggest_prefix ON suggest(word);
  CREATE INDEX IF NOT EXISTS idx_entry_id_meanings ON meanings(entry_id);
  CREATE INDEX IF NOT EXISTS idx_entry_id_examples ON examples(entry_id);
`)

db.close()

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`\n✅ Done! ${written.toLocaleString()} entries written in ${elapsed}s`)
console.log(`   Errors: ${errors}`)
console.log(`   Output: ${DB_PATH}`)
