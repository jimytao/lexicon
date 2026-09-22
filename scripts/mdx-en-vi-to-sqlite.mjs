/** Convert SPDict Anh–Việt MDX into Lexicon's SQLite schema. */
import { MDX } from 'js-mdict'
import initSqlJs from 'sql.js'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MDX = String.raw`D:\vibe coding\牛津高阶英汉双解词典（第9版）- 带高清版图片\vit-eng\SPDict-Anh-Viet.mdx`
const DEFAULT_DB = resolve('public/assets/databases/lexicon_vi.db')
const VIETNAMESE_MARK = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu
const POS = new Map([
  ['danh từ', 'noun'], ['động từ', 'verb'], ['nội động từ', 'verb'], ['ngoại động từ', 'verb'],
  ['tính từ', 'adj'], ['phó từ', 'adv'], ['trạng từ', 'adv'], ['thán từ', 'interjection'],
  ['giới từ', 'preposition'], ['liên từ', 'conjunction'], ['đại từ', 'pronoun'],
])

const clean = (value) => String(value ?? '').replace(/\0/g, '').replace(/\s+/g, ' ').trim()

export function parseSpdictEntry(word, rawDefinition) {
  let text = clean(rawDefinition)
  const phoneticMatch = text.match(/^\/([^/]{1,100})\//u)
  const phonetic = phoneticMatch ? `/${phoneticMatch[1]}/` : ''
  text = text.replace(/^(?:\/[^/]{1,100}\/\s*(?:\([^)]*\)\s*)?)+/u, '').trim()

  const examples = []
  for (const match of text.matchAll(/=([^=+!@*]{2,200})\+([^=+!@*]{2,240})/gu)) {
    const en = clean(match[1])
    const zh = clean(match[2]).replace(/\s+-\s+.*$/u, '')
    if (en && zh) examples.push({ en, zh })
    if (examples.length >= 8) break
  }

  const meanings = []
  const blocks = text.split(/\s*\*\s+/u).filter(Boolean)
  for (const block of blocks) {
    const posLabel = [...POS.keys()].find((label) => block.toLocaleLowerCase('vi').startsWith(label))
    if (!posLabel) continue
    const pos = POS.get(posLabel)
    let body = block.slice(posLabel.length)
    body = body.replace(/=[^=+!@*]{2,200}\+[^=+!@*]{2,240}/gu, ' ')
    body = body.split(/\s[@!]/u, 1)[0]
    for (const part of body.split(/\s+-\s+/u)) {
      const zh = clean(part).replace(/^[-–—]\s*/u, '')
      if (!zh || zh.length > 300 || /^\([^)]*\)$/u.test(zh)) continue
      meanings.push({ zh, en: '', pos })
      if (meanings.length >= 30) break
    }
  }

  const uniqueMeanings = [...new Map(meanings.map((m) => [`${m.pos}\0${m.zh}`, m])).values()]
  return { word: clean(word), phonetic, pos: uniqueMeanings[0]?.pos ?? '', meanings: uniqueMeanings, examples }
}

function reverseTerms(meaning) {
  return meaning
    .replace(/\([^)]*\)/gu, ' ')
    .split(/[;,/]|\s+hoặc\s+/iu)
    .map(clean)
    .filter((term) => term.length >= 2 && term.length <= 80 && VIETNAMESE_MARK.test(term))
}

export async function buildDatabase(mdxPath = DEFAULT_MDX, dbPath = DEFAULT_DB) {
  if (!existsSync(mdxPath)) throw new Error(`SPDict MDX not found: ${mdxPath}`)
  mkdirSync(dirname(dbPath), { recursive: true })
  if (existsSync(dbPath)) unlinkSync(dbPath)

  const mdx = new MDX(mdxPath)
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE entries (id INTEGER PRIMARY KEY, word TEXT NOT NULL, word_lower TEXT NOT NULL, phonetic TEXT, pos TEXT, source TEXT DEFAULT 'spdict');
    CREATE TABLE meanings (id INTEGER PRIMARY KEY, entry_id INTEGER, seq INTEGER, zh TEXT NOT NULL, en TEXT);
    CREATE TABLE examples (id INTEGER PRIMARY KEY, entry_id INTEGER, en TEXT NOT NULL, zh TEXT);
    CREATE TABLE suggest (word TEXT PRIMARY KEY, zh_brief TEXT);
    CREATE TABLE reverse_lookup (term TEXT NOT NULL, word TEXT NOT NULL, rank INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(term, word));
    CREATE TABLE history (id INTEGER PRIMARY KEY, word TEXT NOT NULL, looked_up_at INTEGER NOT NULL);
  `)
  const addEntry = db.prepare('INSERT INTO entries(id, word, word_lower, phonetic, pos, source) VALUES (?, ?, ?, ?, ?, ?)')
  const addMeaning = db.prepare('INSERT INTO meanings(entry_id, seq, zh, en) VALUES (?, ?, ?, ?)')
  const addExample = db.prepare('INSERT INTO examples(entry_id, en, zh) VALUES (?, ?, ?)')
  const addSuggest = db.prepare('INSERT OR IGNORE INTO suggest(word, zh_brief) VALUES (?, ?)')
  const addReverse = db.prepare('INSERT OR IGNORE INTO reverse_lookup(term, word, rank) VALUES (?, ?, ?)')
  let nextEntryId = 1
  const insert = (entries) => {
    db.run('BEGIN')
    for (const entry of entries) {
      if (!entry.word || entry.word.length > 100 || entry.meanings.length === 0) continue
      const id = nextEntryId++
      addEntry.run([id, entry.word, entry.word.toLocaleLowerCase('en'), entry.phonetic, entry.pos, 'spdict'])
      entry.meanings.forEach((m, i) => {
        addMeaning.run([id, i + 1, m.zh, m.en])
        for (const term of reverseTerms(m.zh)) addReverse.run([term.toLocaleLowerCase('vi'), entry.word, i])
      })
      entry.examples.forEach((ex) => addExample.run([id, ex.en, ex.zh]))
      addSuggest.run([entry.word.toLocaleLowerCase('en'), entry.meanings.slice(0, 2).map((m) => m.zh).join('; ').slice(0, 180)])
    }
    db.run('COMMIT')
  }

  const keywords = mdx.keywordList ?? []
  let batch = []
  let parsed = 0
  for (const keyword of keywords) {
    const raw = mdx.lookup(keyword.keyText)?.definition
    if (raw) batch.push(parseSpdictEntry(keyword.keyText, raw))
    if (batch.length >= 1000) { insert(batch); parsed += batch.length; batch = [] }
  }
  if (batch.length) { insert(batch); parsed += batch.length }
  db.run(`
    CREATE INDEX idx_entries_word_lower ON entries(word_lower);
    CREATE INDEX idx_meanings_entry ON meanings(entry_id);
    CREATE INDEX idx_examples_entry ON examples(entry_id);
    CREATE INDEX idx_suggest_word ON suggest(word);
    CREATE INDEX idx_reverse_term ON reverse_lookup(term);
  `)
  const count = (table) => Number(db.exec(`SELECT count(*) AS n FROM ${table}`)[0]?.values[0]?.[0] ?? 0)
  const counts = {
    scanned: keywords.length,
    parsed,
    entries: count('entries'),
    meanings: count('meanings'),
    examples: count('examples'),
    reverseTerms: count('reverse_lookup'),
  }
  for (const stmt of [addEntry, addMeaning, addExample, addSuggest, addReverse]) stmt.free()
  writeFileSync(dbPath, db.export())
  db.close()
  return { dbPath, ...counts }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildDatabase(process.argv[2] || DEFAULT_MDX, process.argv[3] || DEFAULT_DB)
  console.log(JSON.stringify(result, null, 2))
}
