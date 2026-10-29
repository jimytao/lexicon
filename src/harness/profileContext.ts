/**
 * Learner-profile context for everyday AI prompts. Pure: the caller supplies the
 * stored profile, so this module never touches storage or stores.
 */
import type { LearningRoute, ProfileLearnerLanguage, UserLanguageProfile, WeaknessPattern } from '../types'
import { hotWeaknesses, sortActiveByHeat } from '../utils/profileHeat'

export type ProfileContextVariant = 'full' | 'compact'

const HISTORY_EVIDENCE_RULE = '\nHISTORY EVIDENCE: searchedItems are unverified search strings, NOT authoritative vocabulary or definitions. A past query may be misspelled or meaningless. Never invent a meaning for a historical token or present it as an established term unless a supporting definition was supplied. Prefer a grounded structural comparison or omit the tip.\n'

const weaknessLine = (w: WeaknessPattern) =>
  `- [referenceId=${w.id}] [${w.track || 'grammar'}]: ${w.description || ''}${w.contrastExample ? ` (e.g. ${w.contrastExample})` : ''}`

/** Only the active lane and dictionary language; mastered items never steer live answers. */
export function laneProfile(
  profile: UserLanguageProfile,
  route: LearningRoute,
  learnerLanguage: ProfileLearnerLanguage,
): UserLanguageProfile {
  const owns = (item: { learningDirection?: string; learnerLanguage?: ProfileLearnerLanguage }) =>
    item.learningDirection === route && (item.learnerLanguage ?? 'zh') === learnerLanguage
  return {
    ...profile,
    weaknessPatterns: profile.weaknessPatterns.filter((w) => owns(w) && w.status !== 'mastered'),
    recentExplorationFocus: profile.recentExplorationFocus.filter(owns),
    recommendations: profile.recommendations.filter(owns),
  }
}

const FULL_INSTRUCTION: Record<'in' | 'out', string> = {
  out: `INSTRUCTION (optional learning connection): these are the learner's own past mistakes (OUT lane). Compare them ONLY with the text inside <learner_original>; your own correctForm / nativeForm is not learner evidence. A comparison may connect different but instructively related patterns (such as to do vs doing); explain the shared logic or distinction. Claim repetition only for the SAME mistake, progress only when the submitted text already uses it correctly, and never stable mastery from one sentence. A useful brief extension is also allowed. Omit the insight when nothing adds value; no quota or forced encouragement.\n`,
  in: `INSTRUCTION (personalized mentor tip, only if relevant): these weak spots come from the learner's reading (IN lane). The input is external material, NOT the learner's writing — never praise or blame the learner for its wording; you may only point out that it contains a pattern they have been learning.\n`,
}

/**
 * - `'full'`    — up to 6 active weak spots + 3 focus areas + mentor-tip rule (sentence analysis).
 * - `'compact'` — ≤3 hot weak spots + ≤2 focus areas + a soft opt-in rule (word / phrase / chat).
 * Returns `''` when there is nothing worth injecting.
 */
export function buildLaneProfileContext(
  profile: UserLanguageProfile,
  variant: ProfileContextVariant,
  route: LearningRoute,
  learnerLanguage: ProfileLearnerLanguage,
  now: number = Date.now(),
): string {
  if (route === 'irrelevant') return ''
  const lane = laneProfile(profile, route, learnerLanguage)

  if (variant === 'compact') {
    const hot = hotWeaknesses(lane, now, 3)
    const focus = lane.recentExplorationFocus.slice(0, 2)
    if (hot.length === 0 && focus.length === 0) return ''
    const weaknessSection = hot.length > 0
      ? "\n=== LEARNER'S RECURRING CONFUSIONS (optional personalization) ===\n" + hot.map(weaknessLine).join('\n')
      : ''
    const focusSection = focus.length > 0
      ? '\n=== RECENT LEARNING FOCUS (soft relevance only) ===\n' + focus
          .map((item) => `- [referenceId=focus:${item.category}] ${item.category}: ${(item.searchedItems || []).slice(0, 3).join(', ')}`)
          .join('\n')
      : ''
    return (
      `\n${weaknessSection}${focusSection}${HISTORY_EVIDENCE_RULE}` +
      '\nINSTRUCTION: ONLY IF clearly relevant, you MAY add one short contrast or choose one fitting example angle. Never replace, shorten, or distort the standard analysis; if there is no clear link, ignore this section.\n'
    )
  }

  if (!lane.weaknessPatterns.length && !lane.recentExplorationFocus.length) return ''
  const weaknesses = sortActiveByHeat(lane, now).slice(0, 6).map(weaknessLine).join('\n')
  const focus = lane.recentExplorationFocus
    .slice(0, 3)
    .map((f) => `- [referenceId=focus:${f.category}] Category: ${f.category} (${(f.searchedItems || []).slice(0, 5).join(', ')})`)
    .join('\n')

  let res = '\n\n=== USER LEARNING PROFILE & HISTORY ===\n'
  if (weaknesses) res += `Known Weak Spots & Recurring Errors:\n${weaknesses}\n`
  if (focus) res += `Recent Focus Areas:\n${focus}\n`
  res += HISTORY_EVIDENCE_RULE + FULL_INSTRUCTION[route]
  return res
}
