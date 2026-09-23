import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import type { DBService } from './db'
import {
  resolveDictionaryTarget,
  suggestWithRunner,
  lookupWithRunner,
  relatedPhrasesWithRunner,
  whenSettingsHydrated,
  initUserWordMemoryTable,
  getUserWordMemoryWithRunner,
  saveUserNoteWithRunner,
  saveConversationWithRunner,
  saveCoreConceptWithRunner,
  recordWordViewWithRunner,
  getAllWordMemoriesWithRunner,
  type SqlRunner,
  type SqlValue,
} from './db.ops'
import { useSettingsStore } from '../stores/settingsStore'

const DB_ENZH_URL = '/assets/databases/lexicon.db'
const DB_ENEN_URL = '/assets/databases/lexicon_en.db'
const DB_ENVI_URL = '/assets/databases/lexicon_vi.db'

/**
 * 词库字节的来源。抽成可注入是为了让浏览器扩展复用本文件里
 * 全套 epoch / gate 并发与失效逻辑，只替换「字节从哪来」这一层。
 *
 * 返回 `null` 表示该词库不可用 —— 英英库走既有的降级到双语库路径。
 * 见 lexicon-docs/10-browser-extension.md §3。
 */
export type DictionaryId = 'enzh' | 'envi' | 'enen'
export type DbBytesSource = (dict: DictionaryId) => Promise<ArrayBuffer | null>

const httpBytesSource: DbBytesSource = async (dict) => {
  const response = await fetch(dict === 'enen' ? DB_ENEN_URL : dict === 'envi' ? DB_ENVI_URL : DB_ENZH_URL)
  if (!response.ok) return null
  return response.arrayBuffer()
}

let _bytesSource: DbBytesSource = httpBytesSource

/** 必须在首次查词前调用（db.extension.ts 在模块加载时即注入）。 */
export function setDbBytesSource(source: DbBytesSource): void {
  _bytesSource = source
}

let _SQL: SqlJsStatic | null = null
let _SQLLoading: Promise<SqlJsStatic> | null = null

let _dbEnZh: Database | null = null
let _dbEnEn: Database | null = null
let _dbEnVi: Database | null = null
let _loadingEnZh: Promise<Database> | null = null
let _loadingEnEn: Promise<Database> | null = null
let _loadingEnVi: Promise<Database> | null = null
let _enzhEpoch = 0
let _enenEpoch = 0
let _enviEpoch = 0
let _enzhGate: Promise<void> = Promise.resolve()
let _enenGate: Promise<void> = Promise.resolve()
let _enviGate: Promise<void> = Promise.resolve()
let _enenUnavailable = false

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
  _enenUnavailable = false
  _enenEpoch++
  const inFlight = _loadingEnEn
  _loadingEnEn = null
  if (inFlight) {
    _enenGate = inFlight.then(() => undefined, () => undefined)
  }
}

function invalidateEnVi() {
  closeDb(_dbEnVi)
  _dbEnVi = null
  _enviEpoch++
  const inFlight = _loadingEnVi
  _loadingEnVi = null
  if (inFlight) _enviGate = inFlight.then(() => undefined, () => undefined)
}

useSettingsStore.subscribe((state, prev) => {
  if (state.mainDictionary === prev.mainDictionary) return
  invalidateEnZh()
  invalidateEnEn()
  invalidateEnVi()
})

/**
 * 让两本词库的内存实例作废，下次查词重新走字节来源。
 *
 * 扩展侧「删除已下载词库」必须调它 —— 只删 OPFS 文件是不够的，
 * sql.js 的 Database 仍在内存里，删完照样能查，用户会以为没生效。
 */
export function invalidateDictionaries(): void {
  invalidateEnZh()
  invalidateEnEn()
  invalidateEnVi()
}

function isDbInvalidatedError(e: unknown): boolean {
  return e instanceof Error && e.name === 'DbInvalidated'
}

function throwDbInvalidated(): never {
  const err = new Error('Dictionary cache invalidated during load')
  err.name = 'DbInvalidated'
  throw err
}

function toRunner(db: Database): SqlRunner {
  return {
    async exec(sql, params) {
      const results = db.exec(sql, params as (string | number | null | Uint8Array)[] | undefined)
      if (!results[0]) return []
      const columns = results[0].columns
      return results[0].values.map((row) => {
        const obj: Record<string, SqlValue> = {}
        columns.forEach((col, i) => {
          obj[col] = row[i] as SqlValue
        })
        return obj
      })
    },
  }
}

async function getDbEnZh(): Promise<Database> {
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
      const buffer = await _bytesSource('enzh')
      if (!buffer) {
        throw new Error('lexicon.db not found — place it under public/assets/databases/')
      }
      const db = new SQL.Database(new Uint8Array(buffer))
      if (epoch !== _enzhEpoch) {
        closeDb(db)
        throwDbInvalidated()
      }
      _dbEnZh = db
      void initUserWordMemoryTable(toRunner(db))
      if (epoch !== _enzhEpoch) {
        if (_dbEnZh === db) _dbEnZh = null
        closeDb(db)
        throwDbInvalidated()
      }
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
  if (_enenUnavailable) return getDbEnZh()
  for (;;) {
    if (_dbEnEn) return _dbEnEn
    await _enenGate
    if (_enenUnavailable) return getDbEnZh()
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
      let buffer: ArrayBuffer | null
      try {
        buffer = await _bytesSource('enen')
      } catch (err) {
        console.warn('Error fetching lexicon_en.db, falling back to lexicon.db:', err)
        if (epoch === _enenEpoch) _enenUnavailable = true
        return getDbEnZh()
      }
      if (!buffer) {
        console.warn('lexicon_en.db not found, falling back to lexicon.db')
        if (epoch === _enenEpoch) _enenUnavailable = true
        return getDbEnZh()
      }
      const db = new SQL.Database(new Uint8Array(buffer))
      if (epoch !== _enenEpoch) {
        closeDb(db)
        throwDbInvalidated()
      }
      _dbEnEn = db
      void initUserWordMemoryTable(toRunner(db))
      if (epoch !== _enenEpoch) {
        if (_dbEnEn === db) _dbEnEn = null
        closeDb(db)
        throwDbInvalidated()
      }
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

async function getDbEnVi(): Promise<Database> {
  for (;;) {
    if (_dbEnVi) return _dbEnVi
    await _enviGate
    if (_dbEnVi) return _dbEnVi
    if (_loadingEnVi) return _loadingEnVi
    const epoch = _enviEpoch
    const loading = (async () => {
      const SQL = await getSQL()
      const buffer = await _bytesSource('envi')
      if (!buffer) throw new Error('lexicon_vi.db not found — place it under public/assets/databases/')
      const db = new SQL.Database(new Uint8Array(buffer))
      if (epoch !== _enviEpoch) { closeDb(db); throwDbInvalidated() }
      _dbEnVi = db
      void initUserWordMemoryTable(toRunner(db))
      return db
    })()
    _loadingEnVi = loading
    void loading.finally(() => { if (_loadingEnVi === loading) _loadingEnVi = null })
    try { return await loading } catch (e) { if (isDbInvalidatedError(e)) continue; throw e }
  }
}

async function getTargetDb(queryText: string): Promise<Database> {
  const target = resolveDictionaryTarget(queryText)
  return target === 'enen' ? getDbEnEn() : target === 'envi' ? getDbEnVi() : getDbEnZh()
}

async function runnerForQuery(queryText: string): Promise<SqlRunner> {
  return toRunner(await getTargetDb(queryText))
}

export async function warmupDictionary(): Promise<void> {
  await whenSettingsHydrated()
  const settings = useSettingsStore.getState()
  if (settings.monolingualWord || settings.mainDictionary === 'en-en') {
    await getDbEnEn()
  } else if (settings.mainDictionary === 'en-vi') {
    await getDbEnVi()
  } else {
    await getDbEnZh()
  }
}

export const webDB: DBService = {
  async suggest(prefix, limit = 20) {
    const runner = await runnerForQuery(prefix)
    return suggestWithRunner(runner, prefix, limit)
  },

  async lookup(word) {
    const runner = await runnerForQuery(word)
    return lookupWithRunner(runner, word)
  },

  async getRelatedPhrases(word, limit = 30) {
    const runner = await runnerForQuery(word)
    return relatedPhrasesWithRunner(runner, word, limit)
  },

  async getUserWordMemory(word) {
    const runner = await runnerForQuery(word)
    return getUserWordMemoryWithRunner(runner, word)
  },

  async saveUserWordNote(word, note) {
    const runner = await runnerForQuery(word)
    return saveUserNoteWithRunner(runner, word, note)
  },

  async saveUserWordConversation(word, conversationsJson, cognitive) {
    const runner = await runnerForQuery(word)
    return saveConversationWithRunner(runner, word, conversationsJson, cognitive)
  },

  async saveUserWordCoreConcept(word, coreConceptText) {
    const runner = await runnerForQuery(word)
    return saveCoreConceptWithRunner(runner, word, coreConceptText)
  },

  async recordWordView(word) {
    const runner = await runnerForQuery(word)
    return recordWordViewWithRunner(runner, word)
  },

  async getAllUserWordMemories() {
    const runner = await runnerForQuery('a')
    return getAllWordMemoriesWithRunner(runner)
  },
}

