/**
 * Provenance — who wrote each piece of text the AI is shown.
 *
 * The AI reads these tags but never assigns them. Code wraps every block when it
 * builds a prompt, so inside one response the model cannot quietly turn its own
 * correction into "something the learner wrote".
 */

export type TextSource = 'learner' | 'external' | 'ai'

const TAG_NAME: Record<TextSource, string> = {
  learner: 'learner_original',
  external: 'external_material',
  ai: 'ai_generated',
}

const ANY_TAG = /<\/?\s*(learner_original|external_material|ai_generated)\s*>/gi

export function tagText(source: TextSource, text: string): string {
  const name = TAG_NAME[source]
  // Typed or AI-echoed tags must not close a block early and relabel the rest.
  return `<${name}>${text.replace(ANY_TAG, '')}</${name}>`
}

export const PROVENANCE_LEGEND = `
TEXT PROVENANCE TAGS (set by the app, never by you):
- <learner_original>…</learner_original> = exactly what the learner typed. The ONLY evidence of the learner's own language.
- <external_material>…</external_material> = text the learner is reading or looking up; someone else wrote it. Never treat it as the learner's writing.
- <ai_generated>…</ai_generated> = written by an AI (corrections, analyses, answers). NEVER evidence of what the learner can or cannot do.
- Anything you produce yourself in this response (correctForm, nativeForm, explanations) also counts as AI-generated.
`

/**
 * Case, curly quotes, whitespace and punctuation must not decide whether the
 * learner "wrote" a span; apostrophes and hyphens stay because they change words.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/\p{P}/gu, (mark) => (mark === "'" || mark === '-' ? mark : ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whole-word containment, so "charge" never matches inside "charging". */
export function containsSpan(haystack: string, span: string): boolean {
  const needle = normalizeForMatch(span)
  if (!needle) return false
  return ` ${normalizeForMatch(haystack)} `.includes(` ${needle} `)
}
