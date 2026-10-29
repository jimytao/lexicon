/** Dictionary conversion uses Node's SQLite engine (tested with Node 24).
 * This build-only utility does not affect the app's SQLite runtime.
 */
export async function openDictionaryDatabase(path) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path)
  const paramsOf = args => args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return {
    exec: sql => db.exec(sql),
    pragma: sql => db.exec(`PRAGMA ${sql}`),
    prepare(sql) {
      const stmt = db.prepare(sql)
      return {
        run: (...params) => stmt.run(...paramsOf(params)),
        get: (...params) => stmt.get(...paramsOf(params)),
        free() {},
      }
    },
    transaction(fn) {
      return (...args) => {
        db.exec('BEGIN')
        try { const value = fn(...args); db.exec('COMMIT'); return value }
        catch (error) { db.exec('ROLLBACK'); throw error }
      }
    },
    close: () => db.close(),
  }
}

/** Preserve per-sense POS using existing entries/meanings schema. */
export function splitEntryByPos(entry) {
  const groups = new Map()
  for (const meaning of entry.meanings) {
    const pos = meaning.pos || entry.pos
    if (!groups.has(pos)) groups.set(pos, [])
    groups.get(pos).push(meaning)
  }
  return [...groups].map(([pos, meanings], index) => ({
    ...entry,
    pos,
    meanings,
    examples: entry.examples.filter(ex => ex.pos ? ex.pos === pos : index === 0),
  }))
}
