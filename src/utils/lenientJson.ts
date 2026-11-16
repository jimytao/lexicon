/**
 * Lenient repair for model-emitted JSON. Observed with DeepSeek Flash (2026-11,
 * roughly 1 in 15–25 full lookups):
 *   1. trailing commas before `}` / `]`;
 *   2. bare ASCII quotes inside a string value, e.g. `"本义就是"像木星的人"。"`;
 *   3. raw newlines / control characters inside a string, e.g. `"…友好”。⏎"`.
 * Repairs run only after strict JSON.parse fails, and their output is used only
 * when it then parses — valid JSON is never touched.
 */

/** Drop commas outside string literals that are followed only by whitespace and a closing bracket. */
export function stripTrailingCommas(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === '}' || text[j] === ']') continue
    }
    out += ch
  }
  return out
}

const CONTROL_ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }

/** Escape raw control characters inside string literals (never valid there, so valid JSON is unaffected). */
export function escapeControlChars(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString && ch < ' ') {
      escaped = false
      out += CONTROL_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    }
    out += ch
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    }
  }
  return out
}

function nextNonSpace(text: string, from: number): number {
  let j = from
  while (j < text.length && /\s/.test(text[j])) j++
  return j
}

/**
 * Does the quote at `i` (inside a string) really close it? Only when what follows
 * is JSON structure: `:` `}` `]`, end of text, or a `,` that leads into the next
 * key / value. Anything else (CJK text, punctuation, letters) means the model used
 * a bare quote as prose punctuation.
 */
function closesString(text: string, i: number): boolean {
  const j = nextNonSpace(text, i + 1)
  if (j >= text.length) return true
  const next = text[j]
  if (next === ':' || next === '}' || next === ']') return true
  if (next !== ',') return false
  const k = nextNonSpace(text, j + 1)
  return k >= text.length || /["{[\]}\-0-9tfn]/.test(text[k])
}

/** Escape quotes inside string values that are not followed by JSON structure. */
export function escapeStrayQuotes(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (escaped) {
      escaped = false
      out += ch
    } else if (ch === '\\') {
      escaped = true
      out += ch
    } else if (ch === '"') {
      if (closesString(text, i)) {
        inString = false
        out += ch
      } else {
        out += '\\"'
      }
    } else {
      out += ch
    }
  }
  return out
}

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Return `text` unchanged when it is already valid JSON (or not repairable),
 * otherwise the first repaired version that parses.
 */
export function repairJsonText(text: string): string {
  if (parses(text)) return text
  // Cheapest, most certain repairs first; each stage builds on the previous one.
  const safe = stripTrailingCommas(escapeControlChars(text))
  if (safe !== text && parses(safe)) return safe
  const quoted = stripTrailingCommas(escapeStrayQuotes(escapeControlChars(text)))
  if (quoted !== text && parses(quoted)) return quoted
  return text
}
