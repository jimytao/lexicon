/**
 * MDX (OALD10 English Only) → SQLite 词库转换脚本
 * 用法：node scripts/mdx-en-to-sqlite.mjs
 *
 * 输入：OALD10 MDX 文件
 * 输出：public/lexicon_en.db（SQLite，供 sql.js 在 Web 端加载）
 */

import { MDX } from 'js-mdict'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'

// ── 配置 ──────────────────────────────────────────────────────────────────────
const MDX_PATH = "D:/vibe coding/牛津高阶英汉双解词典（第9版）- 带高清版图片/Oxford Advanced Learner's Dictionary 10th.mdx"
const DB_PATH  = "D:/vibe coding/lexicon/public/lexicon_en.db"
const BATCH    = 500   // 每批写入条数
// ─────────────────────────────────────────────────────────────────────────────

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function normalizePos(raw) {
  const s = raw.toLowerCase().replace(/\./g, '').trim()
  if (s.includes('noun') || s === 'n') return 'noun'
  if (s.includes('verb') || s === 'v') return 'verb'
  if (s.includes('adj') || s === 'a') return 'adj'
  if (s.includes('adv')) return 'adv'
  if (s.includes('phrase') || s.includes('phr')) return 'phrase'
  return s || 'noun'
}

function getOuterTagContent(html, className, tagName = 'span') {
  const startRegex = new RegExp(`<${tagName}[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'i')
  const match = html.match(startRegex)
  if (!match) return null
  
  const startTag = match[0]
  const startIdx = html.indexOf(startTag)
  const contentStart = startIdx + startTag.length
  
  let depth = 1
  let pos = contentStart
  const openTagStr = `<${tagName}`
  const closeTagStr = `</${tagName}>`
  
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.toLowerCase().indexOf(openTagStr, pos)
    const nextClose = html.toLowerCase().indexOf(closeTagStr, pos)
    
    if (nextClose === -1) {
      break
    }
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      pos = nextOpen + openTagStr.length
    } else {
      depth--
      pos = nextClose + closeTagStr.length
    }
  }
  
  if (depth === 0) {
    return html.substring(contentStart, pos - closeTagStr.length)
  }
  
  return null
}

function parseEntry(word, html) {
  // 1. Phonetics (UK phon is usually first, US is second)
  const phonMatches = [...html.matchAll(/<span[^>]*class="phon"[^>]*>(.*?)<\/span>/gs)]
  let phonetic = ''
  if (phonMatches.length > 0) {
    phonetic = stripTags(phonMatches[0][1])
    if (!phonetic.startsWith('/')) phonetic = '/' + phonetic
    if (!phonetic.endsWith('/')) phonetic = phonetic + '/'
  }

  // 2. Part of Speech
  const posMatch = html.match(/<span[^>]*class="pos"[^>]*>(.*?)<\/span>/s)
  const pos = posMatch ? normalizePos(stripTags(posMatch[1])) : 'noun'

  // 3. Senses and Examples
  const meanings = []
  const examples = []

  // Senses are structured as <li class="sense" ...>
  const senseMatches = [...html.matchAll(/<li[^>]*class="[^"]*sense[^"]*"[^>]*>(.*?)(?=<li[^>]*class="[^"]*sense[^"]*"|<\/ol>|<\/ul>|$)/gs)]
  
  for (const sm of senseMatches) {
    const block = sm[1]
    const defContent = getOuterTagContent(block, 'def', 'span')
    if (defContent) {
      let prefix = ''
      const grammarMatch = block.match(/<span[^>]*class="grammar"[^>]*>(.*?)<\/span>/s)
      if (grammarMatch) {
        prefix += stripTags(grammarMatch[1]) + ' '
      }
      const labelsMatch = block.match(/<span[^>]*class="labels"[^>]*>(.*?)<\/span>/s)
      if (labelsMatch) {
        prefix += stripTags(labelsMatch[1]) + ' '
      }

      const en = prefix + stripTags(defContent)
      const zh = en 
      meanings.push({ en, zh })

      // Extract examples inside this sense block
      const exMatches = [...block.matchAll(/<span[^>]*class="x"[^>]*>(.*?)<\/span>/gs)]
      for (const em of exMatches) {
        const exText = stripTags(em[1]).replace(/^◆\s*/, '').trim()
        if (exText && exText.length > 3) {
          examples.push({ en: exText, zh: '' })
        }
      }
    }
  }

  // If no sense blocks found (some simple words might just have a single definition without li.sense)
  if (meanings.length === 0) {
    const defContent = getOuterTagContent(html, 'def', 'span')
    if (defContent) {
      let prefix = ''
      const grammarMatch = html.match(/<span[^>]*class="grammar"[^>]*>(.*?)<\/span>/s)
      if (grammarMatch) {
        prefix += stripTags(grammarMatch[1]) + ' '
      }
      const labelsMatch = html.match(/<span[^>]*class="labels"[^>]*>(.*?)<\/span>/s)
      if (labelsMatch) {
        prefix += stripTags(labelsMatch[1]) + ' '
      }

      const en = prefix + stripTags(defContent)
      meanings.push({ en, zh: en })
    }
    const exMatches = [...html.matchAll(/<span[^>]*class="x"[^>]*>(.*?)<\/span>/gs)]
    for (const em of exMatches) {
      const exText = stripTags(em[1]).replace(/^◆\s*/, '').trim()
      if (exText && exText.length > 3) {
        examples.push({ en: exText, zh: '' })
      }
    }
  }

  return { word, phonetic, pos, meanings, examples: examples.slice(0, 6) }
}

// ── 主程序 ────────────────────────────────────────────────────────────────────

console.log('📖 Loading OALD10 MDX file...')
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
    source TEXT DEFAULT 'oald10'
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
    if (!e.word || e.word.length > 60 || e.meanings.length === 0) continue
    if (/^[\u4e00-\u9fff]/.test(e.word)) continue

    const info = insertEntry.run(e.word, e.word.toLowerCase(), e.phonetic, e.pos, 'oald10')
    const entryId = info.lastInsertRowid

    e.meanings.forEach((m, i) => insertMeaning.run(entryId, i + 1, m.zh, m.en))
    e.examples.forEach(ex => insertExample.run(entryId, ex.en, ex.zh))

    // suggest：取前两个释义拼接成简短提示（英文）
    const brief = e.meanings.slice(0, 2).map(m => m.en.slice(0, 30)).join('; ')
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
    const result = mdx.lookup(kw.keyText)
    if (!result?.definition) { processed++; continue }

    const entry = parseEntry(kw.keyText, result.definition)
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
