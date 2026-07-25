import type { SuggestItem, WordResult, Meaning, Example, UserWordMemory } from '../types'
import { normalizeQuery } from '../utils/text'
import { useSettingsStore } from '../stores/settingsStore'

export type SqlValue = string | number | null | Uint8Array
export type DictionaryTarget = 'enzh' | 'enen'

export interface SqlRunner {
  /** Execute query and return rows as objects. No rows → empty array []. */
  exec(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue>[]>
}

export const USER_WORD_MEMORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS user_word_memory (
    word TEXT PRIMARY KEY,
    first_searched_at TIMESTAMP,
    last_viewed_at TIMESTAMP,
    search_count INTEGER DEFAULT 1,
    user_notes TEXT,
    ai_conversations_json TEXT,
    saved_core_concept TEXT
);
`

const LOCAL_WORD_MEMORY_KEY = 'lexicon-word-memory-backup'

function getLocalWordMemoryMap(): Record<string, UserWordMemory> {
  try {
    const raw = localStorage.getItem(LOCAL_WORD_MEMORY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalWordMemoryMap(map: Record<string, UserWordMemory>): void {
  try {
    localStorage.setItem(LOCAL_WORD_MEMORY_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export async function initUserWordMemoryTable(runner: SqlRunner): Promise<void> {
  try {
    await runner.exec(USER_WORD_MEMORY_TABLE_SQL)
    const map = getLocalWordMemoryMap()
    for (const mem of Object.values(map)) {
      await runner.exec(
        `INSERT INTO user_word_memory (word, first_searched_at, last_viewed_at, search_count, user_notes, ai_conversations_json, saved_core_concept)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(word) DO NOTHING`,
        [
          mem.word,
          mem.firstSearchedAt,
          mem.lastViewedAt,
          mem.searchCount,
          mem.userNotes || null,
          mem.aiConversationsJson || null,
          mem.savedCoreConcept || null,
        ]
      )
    }
  } catch (err) {
    console.warn('[db] Failed to create user_word_memory table:', err)
  }
}

export async function getUserWordMemoryWithRunner(
  runner: SqlRunner,
  word: string
): Promise<UserWordMemory | null> {
  const lw = normalizeQuery(word)
  if (!lw) return null
  try {
    const rows = await runner.exec(
      `SELECT word, first_searched_at, last_viewed_at, search_count, user_notes, ai_conversations_json, saved_core_concept
       FROM user_word_memory WHERE LOWER(word) = LOWER(?)`,
      [lw]
    )
    if (rows.length > 0) {
      const row = rows[0]
      return {
        word: row.word as string,
        firstSearchedAt: row.first_searched_at as string,
        lastViewedAt: row.last_viewed_at as string,
        searchCount: Number(row.search_count) || 1,
        userNotes: (row.user_notes as string) || undefined,
        aiConversationsJson: (row.ai_conversations_json as string) || undefined,
        savedCoreConcept: (row.saved_core_concept as string) || undefined,
      }
    }
  } catch {
    /* fallback to local storage map */
  }
  const map = getLocalWordMemoryMap()
  return map[lw] || null
}

export async function saveUserNoteWithRunner(
  runner: SqlRunner,
  word: string,
  userNotes: string
): Promise<void> {
  const lw = normalizeQuery(word)
  if (!lw) return
  const now = new Date().toISOString()
  const map = getLocalWordMemoryMap()
  const existing = map[lw] || {
    word: lw,
    firstSearchedAt: now,
    lastViewedAt: now,
    searchCount: 1,
  }
  existing.userNotes = userNotes
  existing.lastViewedAt = now
  map[lw] = existing
  saveLocalWordMemoryMap(map)

  try {
    await runner.exec(
      `INSERT INTO user_word_memory (word, first_searched_at, last_viewed_at, search_count, user_notes)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(word) DO UPDATE SET user_notes = ?, last_viewed_at = ?`,
      [lw, now, now, userNotes, userNotes, now]
    )
  } catch (err) {
    console.warn('[db] saveUserNote SQL failed, saved to local fallback', err)
  }
}

export async function saveConversationWithRunner(
  runner: SqlRunner,
  word: string,
  aiConversationsJson: string
): Promise<void> {
  const lw = normalizeQuery(word)
  if (!lw) return
  const now = new Date().toISOString()

  // 20K Token / 50KB (~60,000 chars) capacity guard per word record
  let safeConversationsJson = aiConversationsJson
  if (safeConversationsJson.length > 60000) {
    try {
      const parsed = JSON.parse(safeConversationsJson)
      if (Array.isArray(parsed)) {
        let trimmed = [...parsed]
        while (JSON.stringify(trimmed).length > 60000 && trimmed.length > 1) {
          trimmed.shift() // Drop oldest Q&A pair to fit within 20K Token budget
        }
        safeConversationsJson = JSON.stringify(trimmed)
      }
    } catch {
      safeConversationsJson = safeConversationsJson.slice(-60000)
    }
  }

  const map = getLocalWordMemoryMap()
  const existing = map[lw] || {
    word: lw,
    firstSearchedAt: now,
    lastViewedAt: now,
    searchCount: 1,
  }
  existing.aiConversationsJson = safeConversationsJson
  existing.lastViewedAt = now
  map[lw] = existing
  saveLocalWordMemoryMap(map)

  try {
    await runner.exec(
      `INSERT INTO user_word_memory (word, first_searched_at, last_viewed_at, search_count, ai_conversations_json)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(word) DO UPDATE SET ai_conversations_json = ?, last_viewed_at = ?`,
      [lw, now, now, safeConversationsJson, safeConversationsJson, now]
    )
  } catch (err) {
    console.warn('[db] saveConversation SQL failed, saved to local fallback', err)
  }
}

export async function saveCoreConceptWithRunner(
  runner: SqlRunner,
  word: string,
  savedCoreConcept: string
): Promise<void> {
  const lw = normalizeQuery(word)
  if (!lw) return
  const now = new Date().toISOString()
  const map = getLocalWordMemoryMap()
  const existing = map[lw] || {
    word: lw,
    firstSearchedAt: now,
    lastViewedAt: now,
    searchCount: 1,
  }
  existing.savedCoreConcept = savedCoreConcept
  existing.lastViewedAt = now
  map[lw] = existing
  saveLocalWordMemoryMap(map)

  try {
    await runner.exec(
      `INSERT INTO user_word_memory (word, first_searched_at, last_viewed_at, search_count, saved_core_concept)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(word) DO UPDATE SET saved_core_concept = ?, last_viewed_at = ?`,
      [lw, now, now, savedCoreConcept, savedCoreConcept, now]
    )
  } catch (err) {
    console.warn('[db] saveCoreConcept SQL failed, saved to local fallback', err)
  }
}

export async function recordWordViewWithRunner(
  runner: SqlRunner,
  word: string
): Promise<UserWordMemory> {
  const lw = normalizeQuery(word)
  const now = new Date().toISOString()
  const map = getLocalWordMemoryMap()
  const existing = map[lw] || {
    word: lw,
    firstSearchedAt: now,
    lastViewedAt: now,
    searchCount: 0,
  }
  existing.searchCount = (existing.searchCount || 0) + 1
  existing.lastViewedAt = now
  map[lw] = existing
  saveLocalWordMemoryMap(map)

  try {
    await runner.exec(
      `INSERT INTO user_word_memory (word, first_searched_at, last_viewed_at, search_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(word) DO UPDATE SET search_count = search_count + 1, last_viewed_at = ?`,
      [lw, now, now, now]
    )
  } catch (err) {
    console.warn('[db] recordWordView SQL failed, saved to local fallback', err)
  }
  return existing
}

export async function getAllWordMemoriesWithRunner(
  runner: SqlRunner
): Promise<UserWordMemory[]> {
  try {
    const rows = await runner.exec(
      `SELECT word, first_searched_at, last_viewed_at, search_count, user_notes, ai_conversations_json, saved_core_concept
       FROM user_word_memory ORDER BY last_viewed_at DESC`
    )
    if (rows.length > 0) {
      return rows.map((row) => ({
        word: row.word as string,
        firstSearchedAt: row.first_searched_at as string,
        lastViewedAt: row.last_viewed_at as string,
        searchCount: Number(row.search_count) || 1,
        userNotes: (row.user_notes as string) || undefined,
        aiConversationsJson: (row.ai_conversations_json as string) || undefined,
        savedCoreConcept: (row.saved_core_concept as string) || undefined,
      }))
    }
  } catch {
    /* fallback to local storage map */
  }
  const map = getLocalWordMemoryMap()
  return Object.values(map).sort(
    (a, b) => new Date(b.lastViewedAt).getTime() - new Date(a.lastViewedAt).getTime()
  )
}


/** Route query text to bilingual vs monolingual dictionary (shared by web + native). */
export function resolveDictionaryTarget(queryText: string): DictionaryTarget {
  const isChinese = /[\u4e00-\u9fa5]/.test(queryText)
  if (isChinese) return 'enzh'

  const settings = useSettingsStore.getState()

  if (!settings.autoSwitchDictionary) {
    return settings.activeDictionary === 'lexicon_en.db' ? 'enen' : 'enzh'
  }

  const isPhrase = queryText.trim().includes(' ')
  const isMono = isPhrase ? settings.monolingualPhrase : settings.monolingualWord
  return isMono ? 'enen' : 'enzh'
}

export async function suggestWithRunner(
  runner: SqlRunner,
  prefix: string,
  limit = 20
): Promise<SuggestItem[]> {
  const lp = normalizeQuery(prefix)
  if (!lp) return []
  const hasSpace = lp.includes(' ')
  try {
    const isChinese = /[\u4e00-\u9fa5]/.test(lp)

    if (isChinese) {
      const results = await runner.exec(
        `SELECT word, zh_brief FROM suggest
         WHERE zh_brief LIKE ?
         ORDER BY length(zh_brief), word LIMIT ?`,
        [`%${lp}%`, limit]
      )
      return results.map((row) => ({
        word: row.word as string,
        zhBrief: row.zh_brief as string,
      }))
    }

    if (!hasSpace) {
      const results = await runner.exec(
        `SELECT word, zh_brief FROM suggest
         WHERE word LIKE ? AND word NOT LIKE '% %'
         ORDER BY length(word), word LIMIT ?`,
        [`${lp}%`, limit]
      )
      if (results.length > 0) {
        return results.map((row) => ({
          word: row.word as string,
          zhBrief: row.zh_brief as string,
        }))
      }
      const fallback = await runner.exec(
        `SELECT DISTINCT word_lower as word FROM entries
         WHERE word_lower LIKE ? AND word_lower NOT LIKE '% %'
         ORDER BY length(word_lower), word_lower LIMIT ?`,
        [`${lp}%`, limit]
      )
      return fallback.map((row) => ({
        word: row.word as string,
        zhBrief: '',
      }))
    }

    const half = Math.ceil(limit / 2)
    const prefixRes = await runner.exec(
      `SELECT word, zh_brief FROM suggest
       WHERE word LIKE ? AND word LIKE '% %'
       ORDER BY length(word), word LIMIT ?`,
      [`${lp}%`, half]
    )
    const fuzzyRes = await runner.exec(
      `SELECT word, zh_brief FROM suggest
       WHERE word LIKE ? AND word LIKE '% %' AND word NOT LIKE ?
       ORDER BY length(word), word LIMIT ?`,
      [`%${lp}%`, `${lp}%`, half]
    )
    const seen = new Set<string>()
    const items: SuggestItem[] = []
    for (const res of [prefixRes, fuzzyRes]) {
      for (const row of res) {
        const ws = row.word as string
        if (!seen.has(ws)) {
          seen.add(ws)
          items.push({ word: ws, zhBrief: row.zh_brief as string })
        }
      }
    }
    return items.slice(0, limit)
  } catch {
    const mock = ['satisfaction', 'satisfy', 'satisfactory', 'satisfying', 'satiate']
    return mock.filter((w) => w.startsWith(lp)).map((w) => ({ word: w, zhBrief: '示例释义' }))
  }
}

export async function lookupWithRunner(
  runner: SqlRunner,
  word: string
): Promise<WordResult | null> {
  const lw = normalizeQuery(word)
  try {
    const performLookup = async (searchWord: string): Promise<WordResult | null> => {
      const entryRes = await runner.exec(
        `SELECT id, phonetic, pos FROM entries WHERE word_lower = ?`,
        [searchWord.toLowerCase()]
      )
      if (entryRes.length === 0) return null

      const allMeanings: Meaning[] = []
      const allExamples: Example[] = []
      const posSet = new Set<string>()
      let phonetic = ''

      for (const row of entryRes) {
        const id = row.id as number
        const ph = row.phonetic as string
        const pos = row.pos as string

        if (ph && !phonetic) phonetic = ph
        if (pos) posSet.add(pos)

        const meaningRes = await runner.exec(
          `SELECT zh, en FROM meanings WHERE entry_id = ? ORDER BY seq`,
          [id]
        )
        const meanings = meaningRes.map((r) => ({
          zh: r.zh as string,
          en: r.en as string,
          pos: pos,
        }))
        allMeanings.push(...meanings)

        const exampleRes = await runner.exec(
          `SELECT en, zh FROM examples WHERE entry_id = ? LIMIT 5`,
          [id]
        )
        const examples = exampleRes.map((r) => ({
          en: r.en as string,
          zh: r.zh as string,
        }))
        allExamples.push(...examples)
      }

      return {
        word: searchWord,
        phonetic,
        pos: Array.from(posSet).join('/'),
        meanings: allMeanings,
        examples: allExamples.slice(0, 9),
      }
    }

    let result = await performLookup(lw)
    if (result) return result

    const stripped = lw.replace(/[.?!,;:]+$/, '')
    if (stripped !== lw) {
      result = await performLookup(stripped)
      if (result) return result
    }

    const isChinese = /[\u4e00-\u9fa5]/.test(lw)
    if (isChinese) {
      const reverseRes = await runner.exec(
        `SELECT word FROM suggest WHERE zh_brief LIKE ? LIMIT 1`,
        [`%${lw}%`]
      )
      const mapped = reverseRes[0]?.word
      if (typeof mapped === 'string') {
        result = await performLookup(mapped)
        if (result) return result
      }
    }

    return null
  } catch {
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
}

export async function relatedPhrasesWithRunner(
  runner: SqlRunner,
  word: string,
  limit = 30
): Promise<SuggestItem[]> {
  const lw = normalizeQuery(word)
  try {
    const results = await runner.exec(
      `SELECT word, zh_brief FROM suggest
       WHERE word LIKE ? AND word LIKE '% %'
       ORDER BY length(word), word LIMIT ?`,
      [`${lw} %`, limit]
    )
    return results.map((row) => ({
      word: row.word as string,
      zhBrief: row.zh_brief as string,
    }))
  } catch {
    return []
  }
}

export function whenSettingsHydrated(): Promise<void> {
  const api = useSettingsStore.persist
  if (api.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = api.onFinishHydration(() => {
      unsub()
      resolve()
    })
  })
}
