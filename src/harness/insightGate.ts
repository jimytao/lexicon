/**
 * Weak-spot insight bubble — what the AI may claim, and the code check on it.
 *
 * The AI must say which kind of link it is making and quote the learner's own
 * words. Code then verifies the quote against the text the learner actually typed,
 * so "you used it correctly this time" can never be backed by the AI's own fix.
 */
import type { LearningRoute, ProfileLearnerLanguage, UserLanguageProfile } from '../types'
import { containsSpan } from './provenance'

export type InsightKind = 'repeat' | 'improved' | 'related' | 'extension'

export function learningReferences(profile: UserLanguageProfile, route: LearningRoute, language: ProfileLearnerLanguage) {
  const owns = (item: { learningDirection?: string; learnerLanguage?: ProfileLearnerLanguage }) =>
    item.learningDirection === route && (item.learnerLanguage ?? 'zh') === language
  return [
    ...profile.weaknessPatterns.filter(w => owns(w) && w.status !== 'mastered').map(w => w.id),
    ...profile.recentExplorationFocus.filter(owns).map(f => `focus:${f.category}`),
  ]
}

export interface InsightCheckContext {
  route: LearningRoute
  /** The learner's own English production, verbatim. Absent when the input is not their writing. */
  learnerText?: string
  /** The AI's corrected version of learnerText, when one was made. */
  correctedText?: string
  /** IDs from the same lane/language profile shown when this request was built. */
  referenceIds?: readonly string[]
}

/**
 * Schema line for the optional `profileInsight` field. `judgesLearnerWriting`
 * is true only when the input is the learner's own English (OUT phrase/sentence);
 * everywhere else only a neutral "related" link is allowed.
 */
export function buildProfileInsightField(nativeLanguageName: string, judgesLearnerWriting: boolean): string {
  const kinds = judgesLearnerWriting
    ? `"kind": "repeat" | "improved" | "related", "learnerSpan": "words copied EXACTLY from <learner_original>", "text": "ONE short sentence in ${nativeLanguageName}". kind "repeat" = <learner_original> makes that SAME mistake again (learnerSpan = the wrong words as typed). kind "improved" = <learner_original> ALREADY uses the correct form before any correction (learnerSpan = those correct words as typed — never words that appear only in your correctForm). kind "related" = the input merely involves that pattern; no praise and no blame`
    : `"kind": "related" | "extension", "text": "ONE short sentence in ${nativeLanguageName}". Only kind "related" (real learning history) or "extension" (no history claim) is allowed here because this input is not the learner's own writing — never praise or blame the learner for its wording`
  return `"profileInsight": "OPTIONAL — OMIT unless a recurring confusion, earlier learning focus, or a genuinely useful short extension helps here. There is NO quota: most queries may omit it. Shape: { ${kinds} }. Also allow kind extension for ONE brief useful explanation or contrast about the current word/sentence with no personal-history or performance claim. For repeat/improved/related, include referenceId copied from the supplied profile. related may connect DIFFERENT but instructively comparable patterns (e.g. fail to do vs avoid doing); briefly explain the common logic or difference rather than forcing the SAME mistake pattern. Cite a real prior example only when supplied. Never infer past errors from topic alone. For related/extension, do not praise, blame, or assert current mastery. Never claim a habit has been overcome from one example. Keep natural explanatory language; do not force a score or repeat standard analysis. If nothing adds value, omit the field entirely."`
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
  // A result-page tip has evidence for this instance, never stable global mastery.
  if (/(?:已经掌握|已掌握|掌握得|克服.{0,15}习惯|mastered|overcome.{0,20}habit|nắm vững)/iu.test(text)) return undefined

  const kind = readField(fields, 'kind')
  // These catch direct category/text contradictions; semantic language judgement
  // still belongs to the model. The gate only promises verifiable provenance.
  const judgesPerformance = /(?:你(?:这次|这回|现在)?(?:已经|已)?(?:准确|正确|用对|掌握|进步|又犯|再次误用)|(?:这次|这回).{0,12}(?:正确使用|用对|掌握|进步|又犯)|you (?:have |already )?(?:mastered|improved|used .{0,40}correctly|made .{0,20}mistake)|bạn (?:đã |lại )?(?:nắm vững|tiến bộ|sử dụng đúng|mắc lỗi))/iu.test(text)
  if (kind === 'extension') {
    const claimsHistory = /(?:你(?:以前|之前|上次|曾经)|you (?:previously|earlier|last time)|bạn (?:trước đây|lần trước))/iu.test(text)
    return judgesPerformance || claimsHistory ? undefined : text
  }
  const reference = readField(fields, 'referenceId')
  if (!reference || !ctx.referenceIds?.includes(reference)) return undefined
  if (kind === 'related') return judgesPerformance ? undefined : text
  if (kind !== 'repeat' && kind !== 'improved') return undefined
  if (reference.startsWith('focus:')) return undefined

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
