import type { SuggestItem, WordResult, Meaning, Example } from '../types'
import { normalizeQuery } from '../utils/text'
import { useSettingsStore } from '../stores/settingsStore'

export type SqlValue = string | number | null | Uint8Array
export type DictionaryTarget = 'enzh' | 'enen'

export interface SqlRunner {
  /** Execute query and return rows as objects. No rows → empty array []. */
  exec(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue>[]>
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
