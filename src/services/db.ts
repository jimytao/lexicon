import type { SuggestItem, WordResult } from '../types'

export interface DBService {
  /** 前缀搜索（只返回单词，不返回短语），最多 limit 条 */
  suggest(prefix: string, limit?: number): Promise<SuggestItem[]>
  /** 精确查词 */
  lookup(word: string): Promise<WordResult | null>
  /** 查以 word 开头的词组短语，用于结果页展示 */
  getRelatedPhrases(word: string, limit?: number): Promise<SuggestItem[]>
}

import { webDB, warmupDictionary } from './db.web'
export const db: DBService = webDB
export { warmupDictionary }
