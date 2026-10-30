import type { UnnaturalMindModel } from '../types'

export interface ChatCorrectionSource {
  original: string
  correctForm?: string
  correctionNote?: string
  nativeForm?: string
  nativeRationale?: string
  unnaturalMindModel?: UnnaturalMindModel
}

/**
 * The fix and native-expression notes the page already shows. Follow-up chat
 * always sends these (not only in rich mode), so the learner can ask about the
 * AI's own change and get an answer consistent with what is on screen.
 */
export function buildChatCorrectionContext(source: ChatCorrectionSource): string | undefined {
  const lines: string[] = []
  const corrected = source.correctForm?.trim()
  if (corrected && corrected.toLowerCase() !== source.original.toLowerCase()) {
    lines.push(`Minimal fix: "${source.original}" → "${corrected}"`)
    if (source.correctionNote?.trim()) lines.push(`Why it was changed: ${source.correctionNote.trim()}`)
  }
  if (source.nativeForm?.trim()) lines.push(`Native / polished expression: ${source.nativeForm.trim()}`)
  if (source.nativeRationale?.trim()) lines.push(`Why natives say it this way: ${source.nativeRationale.trim()}`)
  const mind = source.unnaturalMindModel
  if (mind && (mind.chineseThought || mind.nativeConcept || mind.reusablePrinciple)) {
    lines.push(
      `Unnatural-thinking analysis: transferred framing "${mind.chineseThought}" → native framing "${mind.nativeConcept}"`
      + (mind.reusablePrinciple ? ` [principle: ${mind.reusablePrinciple}]` : ''),
    )
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}
