import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { Preferences } from '@capacitor/preferences'
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
  type DictionaryTarget,
} from './db.ops'
import { useSettingsStore } from '../stores/settingsStore'

/** Bump when bundled lexicon*.db content changes so devices re-copy from assets. */
export const LEXICON_ASSET_VERSION = '0.7.36'
const ASSET_VERSION_KEY = 'lexicon.db.asset.version'

const CONN_ENZH = 'lexicon'
const CONN_ENEN = 'lexicon_en'

const sqlite = new SQLiteConnection(CapacitorSQLite)

let _ensurePromise: Promise<void> | null = null

let _dbEnZh: SQLiteDBConnection | null = null
let _dbEnEn: SQLiteDBConnection | null = null
let _loadingEnZh: Promise<SQLiteDBConnection> | null = null
let _loadingEnEn: Promise<SQLiteDBConnection> | null = null
let _enzhEpoch = 0
let _enenEpoch = 0
let _enzhGate: Promise<void> = Promise.resolve()
let _enenGate: Promise<void> = Promise.resolve()
/** enen file missing/unopenable — route to enzh without caching enzh under the enen slot. */
let _enenUnavailable = false

function isDbInvalidatedError(e: unknown): boolean {
  return e instanceof Error && e.name === 'DbInvalidated'
}

function throwDbInvalidated(): never {
  const err = new Error('Dictionary cache invalidated during load')
  err.name = 'DbInvalidated'
  throw err
}

async function closeConn(db: SQLiteDBConnection | null, name: string, readonly: boolean) {
  if (!db) return
  try {
    const open = await db.isDBOpen()
    if (open.result) await db.close()
  } catch { /* ignore */ }
  try {
    await sqlite.closeConnection(name, readonly)
  } catch { /* ignore */ }
}

function invalidateEnZh() {
  const cur = _dbEnZh
  _dbEnZh = null
  _enzhEpoch++
  const inFlight = _loadingEnZh
  _loadingEnZh = null
  _enzhGate = Promise.all([
    closeConn(cur, CONN_ENZH, true),
    inFlight ? inFlight.then(() => undefined, () => undefined) : Promise.resolve(),
  ]).then(() => undefined)
}

function invalidateEnEn() {
  const cur = _dbEnEn
  _dbEnEn = null
  _enenUnavailable = false
  _enenEpoch++
  const inFlight = _loadingEnEn
  _loadingEnEn = null
  _enenGate = Promise.all([
    closeConn(cur, CONN_ENEN, true),
    inFlight ? inFlight.then(() => undefined, () => undefined) : Promise.resolve(),
  ]).then(() => undefined)
}

useSettingsStore.subscribe((state, prev) => {
  if (state.activeDictionary === prev.activeDictionary) return
  invalidateEnZh()
  invalidateEnEn()
})

/**
 * Copy bundled public/assets/databases/*.db into the app DB folder when missing
 * or when LEXICON_ASSET_VERSION changes.
 */
export async function ensureNativeDatabases(): Promise<void> {
  if (_ensurePromise) return _ensurePromise
  _ensurePromise = (async () => {
    const { value: stored } = await Preferences.get({ key: ASSET_VERSION_KEY })
    const versionChanged = stored !== LEXICON_ASSET_VERSION

    const enzhExists = (await sqlite.isDatabase(CONN_ENZH)).result === true
    // Only count as missing if the mandatory bilingual dictionary is not found.
    // The English-English dictionary is optional and might not be bundled.
    const missing = !enzhExists

    if (versionChanged || missing) {
      await sqlite.copyFromAssets(versionChanged || missing)
      await Preferences.set({ key: ASSET_VERSION_KEY, value: LEXICON_ASSET_VERSION })
    }

    const enzhOk = (await sqlite.isDatabase(CONN_ENZH)).result === true
    if (!enzhOk) {
      throw new Error(
        'Native lexicon.db missing after copyFromAssets — ensure public/assets/databases/lexicon.db is bundled'
      )
    }
  })().catch((e) => {
    _ensurePromise = null
    throw e
  })
  return _ensurePromise
}

function toRunner(db: SQLiteDBConnection): SqlRunner {
  return {
    async exec(sql, params) {
      const res = await db.query(sql, (params ?? []) as unknown[])
      let rows = (res.values ?? []) as any[]
      if (rows.length === 0) return []

      const first = rows[0]
      if (first !== null && typeof first === 'object') {
        if (!Array.isArray(first)) {
          // Object rows — check and filter iOS header row if it contains column name mappings
          const keys = Object.keys(first)
          if (
            keys.length > 0 &&
            keys.every((k) => {
              const val = first[k]
              return typeof val === 'string' && val.toLowerCase() === k.toLowerCase()
            })
          ) {
            rows = rows.slice(1)
          }
          return rows as Record<string, SqlValue>[]
        } else {
          // Array rows fallback
          const asArrays = rows as SqlValue[][]
          const expected = parseSelectColumns(sql)
          if (
            expected &&
            asArrays.length > 1 &&
            asArrays[0].length === expected.length &&
            asArrays[0].every((c, i) => String(c).toLowerCase() === expected[i].toLowerCase())
          ) {
            return asArrays.slice(1).map((row) => {
              const obj: Record<string, SqlValue> = {}
              expected.forEach((col, i) => {
                obj[col] = row[i]
              })
              return obj
            })
          }
          if (expected) {
            return asArrays.map((row) => {
              const obj: Record<string, SqlValue> = {}
              expected.forEach((col, i) => {
                obj[col] = row[i]
              })
              return obj
            })
          }
          return []
        }
      }
      return []
    },
  }
}

/** Best-effort SELECT column/alias list for detecting an iOS header row. */
function parseSelectColumns(sql: string): string[] | null {
  const m = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i)
  if (!m) return null
  return m[1].split(',').map((raw) => {
    const part = raw.trim()
    const asMatch = part.match(/\bas\s+([A-Za-z_][\w]*)\s*$/i)
    if (asMatch) return asMatch[1]
    const tokens = part.split(/\s+/)
    const last = tokens[tokens.length - 1] ?? part
    return last.replace(/^.*\./, '').replace(/[^A-Za-z0-9_]/g, '')
  }).filter(Boolean)
}

async function openConnection(name: string): Promise<SQLiteDBConnection> {
  await ensureNativeDatabases()
  await sqlite.checkConnectionsConsistency()
  const readonly = true
  const isConn = (await sqlite.isConnection(name, readonly)).result
  let db: SQLiteDBConnection
  if (isConn) {
    db = await sqlite.retrieveConnection(name, readonly)
  } else {
    db = await sqlite.createConnection(name, false, 'no-encryption', 1, readonly)
  }
  const open = await db.isDBOpen()
  if (!open.result) await db.open()
  return db
}

async function getDbEnZh(): Promise<SQLiteDBConnection> {
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
      const db = await openConnection(CONN_ENZH)
      if (epoch !== _enzhEpoch) {
        await closeConn(db, CONN_ENZH, true)
        throwDbInvalidated()
      }
      _dbEnZh = db
      void initUserWordMemoryTable(toRunner(db))
      // Re-check after publish — invalidate may have run between the checks above.
      if (epoch !== _enzhEpoch) {
        if (_dbEnZh === db) _dbEnZh = null
        await closeConn(db, CONN_ENZH, true)
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

async function getDbEnEn(): Promise<SQLiteDBConnection> {
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
      try {
        const db = await openConnection(CONN_ENEN)
        if (epoch !== _enenEpoch) {
          await closeConn(db, CONN_ENEN, true)
          throwDbInvalidated()
        }
        _dbEnEn = db
        if (epoch !== _enenEpoch) {
          if (_dbEnEn === db) _dbEnEn = null
          await closeConn(db, CONN_ENEN, true)
          throwDbInvalidated()
        }
        return db
      } catch (err) {
        if (isDbInvalidatedError(err)) throw err
        console.warn('lexicon_en native open failed, falling back to lexicon:', err)
        if (epoch === _enenEpoch) _enenUnavailable = true
        return getDbEnZh()
      }
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

async function getTargetDb(queryText: string): Promise<SQLiteDBConnection> {
  const target: DictionaryTarget = resolveDictionaryTarget(queryText)
  return target === 'enen' ? getDbEnEn() : getDbEnZh()
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

export const nativeDB: DBService = {
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
