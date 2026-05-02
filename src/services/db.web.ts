import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import type { DBService } from './db'
import type { Meaning, Example } from '../types'

let _db: Database | null = null

async function getDb(): Promise<Database> {
  if (_db) return _db
  const SQL = await initSqlJs({
    locateFile: (file) => `/sql-wasm/${file}`,
  })
  const response = await fetch('/lexicon.db')
  if (!response.ok) {
    throw new Error('lexicon.db not found — run Step 12 to import word database')
  }
  const buffer = await response.arrayBuffer()
  _db = new SQL.Database(new Uint8Array(buffer))
  return _db
}

export const webDB: DBService = {
  async suggest(prefix, limit = 20) {
    const lp = prefix.toLowerCase()
    if (!lp) return []
    const hasSpace = lp.includes(' ')
    try {
      const db = await getDb()
      if (!hasSpace) {
        // 单词模式：排除短语
        const results = db.exec(
          `SELECT word, zh_brief FROM suggest
           WHERE word LIKE ? AND word NOT LIKE '% %'
           ORDER BY length(word), word LIMIT ?`,
          [`${lp}%`, limit]
        )
        if (!results[0]) return []
        return results[0].values.map(([word, zhBrief]) => ({
          word: word as string,
          zhBrief: zhBrief as string,
        }))
      } else {
        // 词组模式：前缀匹配 + 模糊匹配，合并去重
        const half = Math.ceil(limit / 2)
        const prefixRes = db.exec(
          `SELECT word, zh_brief FROM suggest
           WHERE word LIKE ? AND word LIKE '% %'
           ORDER BY length(word), word LIMIT ?`,
          [`${lp}%`, half]
        )
        const fuzzyRes = db.exec(
          `SELECT word, zh_brief FROM suggest
           WHERE word LIKE ? AND word LIKE '% %' AND word NOT LIKE ?
           ORDER BY length(word), word LIMIT ?`,
          [`%${lp}%`, `${lp}%`, half]
        )
        const seen = new Set<string>()
        const items: Array<{ word: string; zhBrief: string }> = []
        for (const res of [prefixRes[0], fuzzyRes[0]]) {
          if (!res) continue
          for (const [w, zh] of res.values) {
            const ws = w as string
            if (!seen.has(ws)) {
              seen.add(ws)
              items.push({ word: ws, zhBrief: zh as string })
            }
          }
        }
        return items.slice(0, limit)
      }
    } catch {
      const mock = ['satisfaction', 'satisfy', 'satisfactory', 'satisfying', 'satiate']
      return mock.filter((w) => w.startsWith(lp)).map((w) => ({ word: w, zhBrief: '示例释义' }))
    }
  },

  async lookup(word) {
    try {
      const db = await getDb()
      const entryRes = db.exec(
        `SELECT id, phonetic, pos FROM entries WHERE word_lower = ?`,
        [word.toLowerCase()]
      )
      if (!entryRes[0] || entryRes[0].values.length === 0) return null

      const allMeanings: Meaning[] = []
      const allExamples: Example[] = []
      const posSet = new Set<string>()
      let phonetic = ''

      for (const [id, ph, pos] of entryRes[0].values) {
        if (ph && !phonetic) phonetic = ph as string
        if (pos) posSet.add(pos as string)

        const meaningRes = db.exec(
          `SELECT zh, en FROM meanings WHERE entry_id = ? ORDER BY seq`,
          [id]
        )
        const meanings = (meaningRes[0]?.values ?? []).map(([zh, en]) => ({
          zh: zh as string,
          en: en as string,
          pos: pos as string,
        }))
        allMeanings.push(...meanings)

        const exampleRes = db.exec(
          `SELECT en, zh FROM examples WHERE entry_id = ? LIMIT 3`,
          [id]
        )
        const examples = (exampleRes[0]?.values ?? []).map(([en, zh]) => ({
          en: en as string,
          zh: zh as string,
        }))
        allExamples.push(...examples)
      }

      const finalPos = Array.from(posSet).join('/')

      return {
        word,
        phonetic,
        pos: finalPos,
        meanings: allMeanings,
        examples: allExamples.slice(0, 6)
      }
    } catch {
      if (word !== 'satisfaction') return null
      return {
        word: 'satisfaction',
        phonetic: '/ˌsæt.ɪsˈfæk.ʃən/',
        pos: 'noun',
        meanings: [
          { zh: '（期望达成后的）满足感', en: 'The feeling of pleasure when sth you wanted to happen does happen.' },
          { zh: '（需求或要求被回应后的）满意', en: 'The act of fulfilling a need, desire, or demand.' },
        ],
        examples: [
          { en: 'She looked at the finished painting with deep satisfaction.', zh: '她带着深深的满足感望着完成的画。' },
        ],
      }
    }
  },

  async getRelatedPhrases(word, limit = 30) {
    try {
      const db = await getDb()
      const lw = word.toLowerCase()
      // 查以该词开头的短语（含空格的条目）
      const results = db.exec(
        `SELECT word, zh_brief FROM suggest
         WHERE word LIKE ? AND word LIKE '% %'
         ORDER BY length(word), word LIMIT ?`,
        [`${lw} %`, limit]
      )
      if (!results[0]) return []
      return results[0].values.map(([w, zh]) => ({
        word: w as string,
        zhBrief: zh as string,
      }))
    } catch {
      return []
    }
  },

  async addHistory(word) {
    try {
      const db = await getDb()
      db.run(`INSERT INTO history(word, looked_up_at) VALUES(?, ?)`, [word, Date.now()])
    } catch { /* 词库未就绪 */ }
  },

  async getHistory(limit = 20) {
    try {
      const db = await getDb()
      const res = db.exec(
        `SELECT DISTINCT word FROM history ORDER BY looked_up_at DESC LIMIT ?`,
        [limit]
      )
      return (res[0]?.values ?? []).map(([w]) => w as string)
    } catch {
      return []
    }
  },
}
