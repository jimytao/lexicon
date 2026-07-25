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

let _SQL: SqlJsStatic | null = null
let _SQLLoading: Promise<SqlJsStatic> | null = null

let _dbEnZh: Database | null = null
let _dbEnEn: Database | null = null
let _loadingEnZh: Promise<Database> | null = null
let _loadingEnEn: Promise<Database> | null = null
let _enzhEpoch = 0
let _enenEpoch = 0
let _enzhGate: Promise<void> = Promise.resolve()
let _enenGate: Promise<void> = Promise.resolve()
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

useSettingsStore.subscribe((state, prev) => {
  if (state.activeDictionary === prev.activeDictionary) return
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
      const response = await fetch(DB_ENZH_URL)
      if (!response.ok) {
        throw new Error('lexicon.db not found — place it under public/assets/databases/')
      }
      const buffer = await response.arrayBuffer()
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
      let response: Response
      try {
        response = await fetch(DB_ENEN_URL)
        if (!response.ok) {
          console.warn('lexicon_en.db not found, falling back to lexicon.db')
          if (epoch === _enenEpoch) _enenUnavailable = true
          return getDbEnZh()
        }
      } catch (err) {
        console.warn('Error fetching lexicon_en.db, falling back to lexicon.db:', err)
        if (epoch === _enenEpoch) _enenUnavailable = true
        return getDbEnZh()
      }
      const buffer = await response.arrayBuffer()
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

async function getTargetDb(queryText: string): Promise<Database> {
  return resolveDictionaryTarget(queryText) === 'enen' ? getDbEnEn() : getDbEnZh()
}

async function runnerForQuery(queryText: string): Promise<SqlRunner> {
  return toRunner(await getTargetDb(queryText))
}

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

  async saveUserWordConversation(word, conversationsJson) {
    const runner = await runnerForQuery(word)
    return saveConversationWithRunner(runner, word, conversationsJson)
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

