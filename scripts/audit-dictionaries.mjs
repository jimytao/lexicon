/** Read-only old/new comparison. Run with node --import tsx (uses UI label parser). */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { cleanDictionaryMeaning, cleanDictionaryBrief, isDictionaryHeaderFragment } from '../src/utils/meaningLabels.ts'

const [baselineDir, generatedDir, output] = process.argv.slice(2)
if (!baselineDir || !generatedDir || !output) throw new Error('Usage: node --import tsx scripts/audit-dictionaries.mjs BASELINE_DIR GENERATED_DIR REPORT_JSON')

function inspect(path, samples) {
  const db = new DatabaseSync(path, { readOnly: true })
  const number = sql => Number(db.prepare(sql).get().n)
  const words = new Set(db.prepare('SELECT DISTINCT word_lower FROM entries').all().map(row => row.word_lower))
  const report = {
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    integrity: db.prepare('PRAGMA quick_check').get().quick_check,
    entries: number('SELECT count(*) AS n FROM entries'),
    words: words.size,
    meanings: number('SELECT count(*) AS n FROM meanings'),
    examples: number('SELECT count(*) AS n FROM examples'),
    grammar: {},
    headerFragments: 0,
    dirtyBriefs: 0,
    bilingualExampleEchoes: 0,
    samples: {},
  }
  for (const row of db.prepare('SELECT zh,en FROM meanings').iterate()) {
    if (isDictionaryHeaderFragment(row.zh)) report.headerFragments++
    for (const tag of cleanDictionaryMeaning(row).grammar) report.grammar[tag] = (report.grammar[tag] ?? 0) + 1
  }
  for (const row of db.prepare('SELECT zh_brief FROM suggest').iterate()) {
    if (/^[&,;]/u.test(cleanDictionaryBrief(row.zh_brief))) report.dirtyBriefs++
  }
  for (const row of db.prepare('SELECT en,zh FROM examples').iterate()) {
    if (row.zh && row.en !== row.zh && row.en.endsWith(row.zh)) report.bilingualExampleEchoes++
  }
  const senses = db.prepare('SELECT e.pos,m.zh,m.en FROM entries e JOIN meanings m ON e.id=m.entry_id WHERE e.word_lower=? ORDER BY e.id,m.seq')
  for (const word of samples) report.samples[word] = senses.all(word).map(row => ({ pos: row.pos, ...cleanDictionaryMeaning(row) }))
  db.close()
  return { report, words }
}

const result = {}
for (const [name, samples] of [
  ['lexicon.db', ['bay', 'bench', 'a']],
  ['lexicon_en.db', ['bay', 'acceleration', 'abort']],
  ['lexicon_vi.db', ['bay', 'abacus', 'aback']],
]) {
  const before = inspect(join(baselineDir, name), samples)
  const after = inspect(join(generatedDir, name), samples)
  const missingWords = [...before.words].filter(word => !after.words.has(word))
  result[name] = { before: before.report, after: after.report, missingWords }
}
writeFileSync(output, JSON.stringify(result, null, 2))
for (const [name, r] of Object.entries(result)) console.log(JSON.stringify({ name, before: { words: r.before.words, meanings: r.before.meanings }, after: { words: r.after.words, meanings: r.after.meanings, grammar: r.after.grammar, integrity: r.after.integrity, headerFragments: r.after.headerFragments, bilingualExampleEchoes: r.after.bilingualExampleEchoes }, missingWords: r.missingWords }))
