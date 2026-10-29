/**
 * Learner-profile context for everyday AI prompts. Pure: the caller supplies the
 * stored profile, so this module never touches storage or stores.
 */
import type { LearningRoute, ProfileLearnerLanguage, UserLanguageProfile, WeaknessPattern } from '../types'
import { hotWeaknesses, sortActiveByHeat } from '../utils/profileHeat'

export type ProfileContextVariant = 'full' | 'compact'

const weaknessLine = (w: WeaknessPattern) =>
  `- [${w.track || 'grammar'}]: ${w.description || ''}${w.contrastExample ? ` (e.g. ${w.contrastExample})` : ''}`

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
  out: `INSTRUCTION (personalized mentor tip, only if relevant): these are the learner's own past mistakes (OUT lane). Compare them ONLY with the text inside <learner_original>; your own correctForm / nativeForm is not learner evidence. A link needs the SAME mistake pattern, not just the same topic. Be honest rather than encouraging: if the learner made that mistake again, say so plainly; say they improved only when <learner_original> itself already uses the correct form.\n`,
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
          .map((item) => `- ${item.category}: ${(item.searchedItems || []).slice(0, 3).join(', ')}`)
          .join('\n')
      : ''
    return (
      `\n${weaknessSection}${focusSection}` +
      '\nINSTRUCTION: ONLY IF clearly relevant, you MAY add one short contrast or choose one fitting example angle. Never replace, shorten, or distort the standard analysis; if there is no clear link, ignore this section.\n'
    )
  }

  if (!lane.weaknessPatterns.length && !lane.recentExplorationFocus.length) return ''
  const weaknesses = sortActiveByHeat(lane, now).slice(0, 6).map(weaknessLine).join('\n')
  const focus = lane.recentExplorationFocus
    .slice(0, 3)
    .map((f) => `- Category: ${f.category} (${(f.searchedItems || []).slice(0, 5).join(', ')})`)
    .join('\n')

  let res = '\n\n=== USER LEARNING PROFILE & HISTORY ===\n'
  if (weaknesses) res += `Known Weak Spots & Recurring Errors:\n${weaknesses}\n`
  if (focus) res += `Recent Focus Areas:\n${focus}\n`
  res += FULL_INSTRUCTION[route]
  return res
}
