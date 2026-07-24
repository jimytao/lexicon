import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import type { DBService } from './db'
import type { Meaning, Example } from '../types'
import { normalizeQuery } from '../utils/text'
import { useSettingsStore } from '../stores/settingsStore'

let _SQL: SqlJsStatic | null = null
let _SQLLoading: Promise<SqlJsStatic> | null = null

let _dbEnZh: Database | null = null
let _dbEnEn: Database | null = null
let _loadingEnZh: Promise<Database> | null = null
let _loadingEnEn: Promise<Database> | null = null
/** Bumped when a cached DB is invalidated so in-flight loads discard stale results. */
let _enzhEpoch = 0
let _enenEpoch = 0
/** Serializes new loads after invalidate so two 30MB+ fetches never overlap. */
let _enzhGate: Promise<void> = Promise.resolve()
let _enenGate: Promise<void> = Promise.resolve()

async function getSQL(): Promise<SqlJsStatic> {
  if (_SQL) return _SQL
  if (_SQLLoading) return _SQLLoading
  const loading = initSqlJs({
    locateFile: (file) => `/sql-wasm/${file}`,
  }).then((SQL) => {
    _SQL = SQL
    return SQL
  })
  _SQLLoading = loading
  void loading.finally(() => {
    if (_SQLLoading === loading) _SQLLoading = null
  })
  return loading
}

function closeDb(db: Database | null) {
  if (!db) return
  try { db.close() } catch { /* already closed */ }
}

function invalidateEnZh() {
  closeDb(_dbEnZh)
  _dbEnZh = null
  _enzhEpoch++
  const inFlight = _loadingEnZh
  _loadingEnZh = null
  if (inFlight) {
    _enzhGate = inFlight.then(() => undefined, () => undefined)
  }
}

function invalidateEnEn() {
  closeDb(_dbEnEn)
  _dbEnEn = null
  _enenEpoch++
  const inFlight = _loadingEnEn
  _loadingEnEn = null
  if (inFlight) {
    _enenGate = inFlight.then(() => undefined, () => undefined)
  }
}

// Only release WASM DBs when the user manually switches the dictionary file.
// Other settings toggles (dark mode, modules, monolingual, …) must NOT unload 30–46MB.
useSettingsStore.subscribe((state, prev) => {
  if (!prev || state.activeDictionary === prev.activeDictionary) return
  invalidateEnZh()
  invalidateEnEn()
})

function isDbInvalidatedError(e: unknown): boolean {
  return e instanceof Error && e.name === 'DbInvalidated'
}

function throwDbInvalidated(): never {
  const err = new Error('Dictionary cache invalidated during load')
  err.name = 'DbInvalidated'
  throw err
}

async function getDbEnZh(): Promise<Database> {
  // Retry outside the in-flight promise. Recursing into getDbEnZh from inside a
  // load that invalidate() awaits via _enzhGate would deadlock.
  for (;;) {
    if (_dbEnZh) return _dbEnZh
    await _enzhGate
    if (_dbEnZh) return _dbEnZh
    if (_loadingEnZh) {
      try {
        return await _loadingEnZh
      } catch (e) {
        if (isDbInvalidatedError(e)) continue
        throw e
      }
    }

    const epoch = _enzhEpoch
    const loading = (async () => {
      const SQL = await getSQL()
      const response = await fetch('/lexicon.db')
      if (!response.ok) {
        throw new Error('lexicon.db not found — run Step 12 to import word database')
      }
      const buffer = await response.arrayBuffer()
      const db = new SQL.Database(new Uint8Array(buffer))
      if (epoch !== _enzhEpoch) {
        closeDb(db)
        throwDbInvalidated()
      }
      _dbEnZh = db
      return db
    })()
    _loadingEnZh = loading
    void loading.finally(() => {
      if (_loadingEnZh === loading) _loadingEnZh = null
    })
    try {
      return await loading
    } catch (e) {
      if (isDbInvalidatedError(e)) continue
      throw e
    }
  }
}

async function getDbEnEn(): Promise<Database> {
  for (;;) {
    if (_dbEnEn) return _dbEnEn
    await _enenGate
    if (_dbEnEn) return _dbEnEn
    if (_loadingEnEn) {
      try {
        return await _loadingEnEn
      } catch (e) {
        if (isDbInvalidatedError(e)) continue
        throw e
      }
    }

    const epoch = _enenEpoch
    const loading = (async () => {
      const SQL = await getSQL()
      let response: Response
      try {
        response = await fetch('/lexicon_en.db')
        if (!response.ok) {
          console.warn('lexicon_en.db not found, falling back to lexicon.db')
          return getDbEnZh()
        }
      } catch (err) {
        console.warn('Error fetching lexicon_en.db, falling back to lexicon.db:', err)
        return getDbEnZh()
      }
      const buffer = await response.arrayBuffer()
      const db = new SQL.Database(new Uint8Array(buffer))
      if (epoch !== _enenEpoch) {
        closeDb(db)
        throwDbInvalidated()
      }
      _dbEnEn = db
      return db
    })()
    _loadingEnEn = loading
    void loading.finally(() => {
      if (_loadingEnEn === loading) _loadingEnEn = null
    })
    try {
      return await loading
    } catch (e) {
      if (isDbInvalidatedError(e)) continue
      throw e
    }
  }
}

async function getTargetDb(queryText: string): Promise<Database> {
  // If the query contains Chinese characters, always route to the bilingual dictionary (lexicon.db)
  const isChinese = /[\u4e00-\u9fa5]/.test(queryText)
  if (isChinese) {
    return getDbEnZh()
  }

  const settings = useSettingsStore.getState()

  if (!settings.autoSwitchDictionary) {
    // Manual mode: always use the chosen activeDictionary
    return settings.activeDictionary === 'lexicon_en.db' ? getDbEnEn() : getDbEnZh()
  }

  // Auto-switch mode: determine database dynamically per query type
  const isPhrase = queryText.trim().includes(' ')
  const isMono = isPhrase ? settings.monolingualPhrase : settings.monolingualWord

  return isMono ? getDbEnEn() : getDbEnZh()
}

function whenSettingsHydrated(): Promise<void> {
  const api = useSettingsStore.persist
  if (api.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = api.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}

/** Prefetch the currently preferred dictionary after first paint (one file only). */
export async function warmupDictionary(): Promise<void> {
  await whenSettingsHydrated()
  const settings = useSettingsStore.getState()
  if (settings.activeDictionary === 'lexicon_en.db') {
    await getDbEnEn()
  } else {
    await getDbEnZh()
  }
}

export const webDB: DBService = {
  async suggest(prefix, limit = 20) {
    const lp = normalizeQuery(prefix)
    if (!lp) return []
    const hasSpace = lp.includes(' ')
    try {
      const db = await getTargetDb(lp)
      const isChinese = /[\u4e00-\u9fa5]/.test(lp)

      if (isChinese) {
        // 中文反向查词：搜索 zh_brief 包含该词的内容
        const results = db.exec(
          `SELECT word, zh_brief FROM suggest
           WHERE zh_brief LIKE ?
           ORDER BY length(zh_brief), word LIMIT ?`,
          [`%${lp}%`, limit]
        )
        if (!results[0]) return []
        return results[0].values.map(([word, zhBrief]) => ({
          word: word as string,
          zhBrief: zhBrief as string,
        }))
      }

      if (!hasSpace) {
        // 单词模式：排除短语
        const results = db.exec(
          `SELECT word, zh_brief FROM suggest
           WHERE word LIKE ? AND word NOT LIKE '% %'
           ORDER BY length(word), word LIMIT ?`,
          [`${lp}%`, limit]
        )
        if (results[0] && results[0].values.length > 0) {
          return results[0].values.map(([word, zhBrief]) => ({
            word: word as string,
            zhBrief: zhBrief as string,
          }))
        }
        // Fallback: suggest table missing entries → query entries table directly
        const fallback = db.exec(
          `SELECT DISTINCT word_lower as word FROM entries
           WHERE word_lower LIKE ? AND word_lower NOT LIKE '% %'
           ORDER BY length(word_lower), word_lower LIMIT ?`,
          [`${lp}%`, limit]
        )
        if (!fallback[0]) return []
        return fallback[0].values.map(([word]) => ({
          word: word as string,
          zhBrief: '',
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
    const lw = normalizeQuery(word)
    try {
      const db = await getTargetDb(lw)

      const performLookup = (searchWord: string) => {
        const entryRes = db.exec(
          `SELECT id, phonetic, pos FROM entries WHERE word_lower = ?`,
          [searchWord.toLowerCase()]
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
            `SELECT en, zh FROM examples WHERE entry_id = ? LIMIT 5`,
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
          word: searchWord,
          phonetic,
          pos: finalPos,
          meanings: allMeanings,
          examples: allExamples.slice(0, 9),
        }
      }

      // 1. Direct match
      let result = performLookup(lw)
      if (result) return result

      // 2. Trailing punctuation fallback (e.g., "apple?" -> "apple")
      const stripped = lw.replace(/[.?!,;:]+$/, '')
      if (stripped !== lw) {
        result = performLookup(stripped)
        if (result) return result
      }

      // 3. Chinese reverse lookup
      const isChinese = /[\u4e00-\u9fa5]/.test(lw)
      if (isChinese) {
        const reverseRes = db.exec(
          `SELECT word FROM suggest WHERE zh_brief LIKE ? LIMIT 1`,
          [`%${lw}%`]
        )
        if (reverseRes[0]?.values?.[0]?.[0]) {
          const mappedWord = reverseRes[0].values[0][0] as string
          result = performLookup(mappedWord)
          if (result) return result
        }
      }

      return null
    } catch {
      // Mock data for development/error cases
      if (lw !== 'satisfaction') return null
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
    const lw = normalizeQuery(word)
    try {
      const db = await getTargetDb(lw)
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


}
