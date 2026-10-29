/**
 * Weak-spot insight bubble — what the AI may claim, and the code check on it.
 *
 * The AI must say which kind of link it is making and quote the learner's own
 * words. Code then verifies the quote against the text the learner actually typed,
 * so "you used it correctly this time" can never be backed by the AI's own fix.
 */
import type { LearningRoute } from '../types'
import { containsSpan } from './provenance'

export type InsightKind = 'repeat' | 'improved' | 'related'

export interface InsightCheckContext {
  route: LearningRoute
  /** The learner's own English production, verbatim. Absent when the input is not their writing. */
  learnerText?: string
  /** The AI's corrected version of learnerText, when one was made. */
  correctedText?: string
}

/**
 * Schema line for the optional `profileInsight` field. `judgesLearnerWriting`
 * is true only when the input is the learner's own English (OUT phrase/sentence);
 * everywhere else only a neutral "related" link is allowed.
 */
export function buildProfileInsightField(nativeLanguageName: string, judgesLearnerWriting: boolean): string {
  const kinds = judgesLearnerWriting
    ? `"kind": "repeat" | "improved" | "related", "learnerSpan": "words copied EXACTLY from <learner_original>", "text": "ONE short sentence in ${nativeLanguageName}". kind "repeat" = <learner_original> makes that SAME mistake again (learnerSpan = the wrong words as typed). kind "improved" = <learner_original> ALREADY uses the correct form before any correction (learnerSpan = those correct words as typed — never words that appear only in your correctForm). kind "related" = the input merely involves that pattern; no praise and no blame`
    : `"kind": "related", "text": "ONE short sentence in ${nativeLanguageName}". Only kind "related" is allowed here because this input is not the learner's own writing — never praise or blame the learner for its wording`
  return `"profileInsight": "OPTIONAL object — OMIT this field entirely unless the input shows the SAME mistake pattern as one of the learner's listed recurring confusions (sharing a topic is NOT enough). Shape: { ${kinds} }. Be honest rather than encouraging."`
}

function readField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Returns the bubble text to show, or undefined to hide it. Anything the code
 * cannot verify is hidden: a wrong bubble is worse than no bubble.
 */
export function gateProfileInsight(raw: unknown, ctx: InsightCheckContext): string | undefined {
  if (ctx.route === 'irrelevant') return undefined
  // A bare string carries no checkable claim (and legacy prompts produced them).
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const fields = raw as Record<string, unknown>
  const text = readField(fields, 'text')
  if (!text) return undefined

  const kind = readField(fields, 'kind')
  if (kind === 'related') return text
  if (kind !== 'repeat' && kind !== 'improved') return undefined

  // Praise or blame needs the learner's own writing on the OUT lane.
  if (ctx.route !== 'out' || !ctx.learnerText) return undefined
  const span = readField(fields, 'learnerSpan')
  if (!span || !containsSpan(ctx.learnerText, span)) return undefined

  // "improved": the correction left those words alone. "repeat": the correction had to change them.
  if (!ctx.correctedText) return kind === 'improved' ? text : undefined
  const keptByCorrection = containsSpan(ctx.correctedText, span)
  if (kind === 'improved') return keptByCorrection ? text : undefined
  return keptByCorrection ? undefined : text
}
