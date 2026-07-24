import type { SuggestItem, WordResult } from '../types'
import { isCapacitor } from './platform'

export interface DBService {
  /** 前缀搜索（只返回单词，不返回短语），最多 limit 条 */
  suggest(prefix: string, limit?: number): Promise<SuggestItem[]>
  /** 精确查词 */
  lookup(word: string): Promise<WordResult | null>
  /** 查以 word 开头的词组短语，用于结果页展示 */
  getRelatedPhrases(word: string, limit?: number): Promise<SuggestItem[]>
}

type DbModule = {
  webDB?: DBService
  nativeDB?: DBService
  warmupDictionary: () => Promise<void>
  ensureNativeDatabases?: () => Promise<void>
}

let _impl: DBService | null = null
let _warmup: (() => Promise<void>) | null = null
let _loading: Promise<void> | null = null

async function loadImpl(): Promise<DBService> {
  if (_impl) return _impl
  if (!_loading) {
    _loading = (async () => {
      if (isCapacitor()) {
        try {
          const mod = await import('./db.native') as DbModule
          if (mod.ensureNativeDatabases) await mod.ensureNativeDatabases()
          _impl = mod.nativeDB!
          _warmup = () => mod.warmupDictionary()
          return
        } catch (e) {
          console.warn('[db] native SQLite init failed, falling back to sql.js', e)
        }
      }

      const mod = await import('./db.web') as DbModule
      _impl = mod.webDB!
      _warmup = () => mod.warmupDictionary()
    })().finally(() => {
      _loading = null
    })
  }
  await _loading
  if (!_impl) throw new Error('Dictionary service failed to initialize')
  return _impl
}

export const db: DBService = {
  suggest: (prefix, limit) => loadImpl().then((i) => i.suggest(prefix, limit)),
  lookup: (word) => loadImpl().then((i) => i.lookup(word)),
  getRelatedPhrases: (word, limit) => loadImpl().then((i) => i.getRelatedPhrases(word, limit)),
}

export async function warmupDictionary(): Promise<void> {
  await loadImpl()
  if (_warmup) await _warmup()
}
