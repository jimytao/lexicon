/**
 * Profile distillation — what the batched diagnostic AI is shown, and what the
 * code accepts back.
 *
 * Events are still batched (≈12 lookups or a hard boundary) to save tokens, so one
 * batch can mix IN and OUT. Instead of trusting the AI to keep them apart, the
 * harness:
 *   1. groups the batch under lane headings and tags every text with who wrote it;
 *   2. sends only the baseline of lanes that have new evidence;
 *   3. asks for the answer split by lane key, and stamps each item's lane from the
 *      key it came back under (item-level lane labels are ignored);
 *   4. leaves a lane without new evidence exactly as it was;
 *   5. refuses any "improved / mastered" claim unless it quotes words the learner
 *      typed that survived correction.
 */
import type {
  CognitiveMode,
  ExplorationFocus,
  LearningDirection,
  ProfileLearnerLanguage,
  ProfileRecommendation,
  UnnaturalMindModel,
  UserLanguageProfile,
  WeaknessPattern,
} from '../types'
import { DEFAULT_CONFIDENCE } from '../utils/profileHeat'
import { getNativeLanguage, type NativeLanguageSpec } from '../services/nativeLanguage'
import { LANES, LANE_TITLE, isLane, partitionByLane, querySource } from './lanes'
import { PROVENANCE_LEGEND, containsSpan, normalizeForMatch, tagText } from './provenance'

export interface DiagnosticEvent {
  /** Stable id for success-only dequeue */
  id: string
  type: 'lookup' | 'sentence' | 'production' | 'chat'
  /** Learner-typed (OUT) or external (IN) text; for chat, the studied query. */
  wordOrContext: string
  /** sentence: the AI's correction. lookup: the AI's core-concept summary. */
  details?: string
  unnaturalMindModel?: UnnaturalMindModel
  userQuestion?: string
  aiAnswer?: string
  /** Lookup vs Pure Core track for AI follow-up events */
  cognitive?: CognitiveMode
  /** Receptive IN vs productive OUT evidence. Legacy events may be unattributed. */
  learningDirection?: LearningDirection
  /** Effective dictionary learner language captured with the event. */
  learnerLanguage?: ProfileLearnerLanguage
  timestamp: string
}

const MAX_HIGH_PRIORITY_EVENTS = 12
const MAX_LOOKUP_EVENTS = 40
const MAX_ACTIVE_PER_LANE = 8

function clamp01(n: unknown): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Bound the token budget using the oldest queued high-priority and lookup events. */
export function selectDiagnosticSnapshot(snapshot: readonly DiagnosticEvent[]): DiagnosticEvent[] {
  const high = new Set(snapshot.filter((e) => e.type !== 'lookup').slice(0, MAX_HIGH_PRIORITY_EVENTS))
  const lookups = new Set(snapshot.filter((e) => e.type === 'lookup').slice(0, MAX_LOOKUP_EVENTS))
  return snapshot.filter((e) => high.has(e) || lookups.has(e))
}

/** Lanes that have new, attributable evidence in this batch. */
export function activeLanes(snapshot: readonly DiagnosticEvent[]): LearningDirection[] {
  const lanes = partitionByLane(snapshot)
  return LANES.filter((lane) => lanes[lane].length > 0)
}

function formatLaneEvents(lane: LearningDirection, events: readonly DiagnosticEvent[]): string {
  const studied = querySource(lane)
  const high: string[] = []
  const normal: string[] = []

  let i = 0
  while (i < events.length) {
    const e = events[i]!
    const at = `[eventId=${e.id}] ${e.timestamp ? `[${e.timestamp}] ` : ''}`
    if (e.type === 'lookup') {
      const concept = e.details ? ` (AI core concept: ${tagText('ai', e.details)})` : ''
      normal.push(`- ${at}searched ${tagText(studied, e.wordOrContext)}${concept}`)
      i += 1
      continue
    }
    if (e.type === 'sentence' || e.type === 'production') {
      const mind = e.unnaturalMindModel ? ` | AI analysis: ${tagText('ai', JSON.stringify(e.unnaturalMindModel))}` : ''
      const label = e.type === 'production' ? 'Independent production (no substantive correction, not a mistake)' : 'Sentence correction'
      high.push(`- ${at}${label}: learner wrote ${tagText('learner', e.wordOrContext)} → AI ${e.type === 'production' ? 'accepted' : 'corrected to'} ${tagText('ai', e.details || '')}${mind}`)
      i += 1
      continue
    }

    // Consecutive follow-ups on the same query read as one session.
    const track = e.cognitive === 'core' ? ' / Pure Core' : e.cognitive === 'lookup' ? ' / Lookup' : ''
    const key = `${e.wordOrContext}||${e.cognitive ?? ''}`
    const lines = [`- ${at}Follow-up Q&A${track} about ${tagText(studied, e.wordOrContext)}`]
    let n = 1
    while (i < events.length) {
      const cur = events[i]!
      if (cur.type !== 'chat' || `${cur.wordOrContext}||${cur.cognitive ?? ''}` !== key) break
      lines.push(`    Q${n}: ${tagText('question', cur.userQuestion || '')}`)
      lines.push(`    A${n}: ${tagText('ai', (cur.aiAnswer || '').slice(0, 1000))}`)
      n += 1
      i += 1
    }
    high.push(lines.join('\n'))
  }

  return [
    `### ${LANE_TITLE[lane]}`,
    `🔥 HIGH PRIORITY (corrections & Q&A):\n${high.length ? high.join('\n') : 'None'}`,
    `💡 NORMAL PRIORITY (searches):\n${normal.length ? normal.join('\n') : 'None'}`,
  ].join('\n')
}

/** Baseline as the AI sees it: lane is implied by the heading, so per-item lane fields are dropped. */
function baselineFor(profile: UserLanguageProfile, lane: LearningDirection) {
  const strip = <T extends { learningDirection?: LearningDirection; learnerLanguage?: ProfileLearnerLanguage }>(items: T[]) =>
    items.filter((item) => item.learningDirection === lane).map(({ learningDirection: _l, learnerLanguage: _g, ...rest }) => rest)
  return {
    // Verified-production evidence is app-owned: the AI cannot change it, and echoing
    // it back only spends output tokens.
    weaknessPatterns: strip(profile.weaknessPatterns)
      .map(({ verifiedProductionIds: _ids, verifiedProductionTexts: _texts, ...rest }) => rest),
    recentExplorationFocus: strip(profile.recentExplorationFocus),
    recommendations: strip(profile.recommendations),
  }
}

export interface DiagnosticPrompts {
  system: string
  user: string
  lanes: LearningDirection[]
}

/**
 * @param laneProfileForLanguage profile already narrowed to the target dictionary
 *        language and to attributable (IN/OUT) records.
 */
export function buildDiagnosticPrompts(
  snapshot: readonly DiagnosticEvent[],
  laneProfileForLanguage: UserLanguageProfile,
  spec: NativeLanguageSpec,
): DiagnosticPrompts {
  const events = snapshot
  const lanes = activeLanes(events)
  const byLane = partitionByLane(events)

  const baseline = Object.fromEntries(lanes.map((lane) => [lane, baselineFor(laneProfileForLanguage, lane)]))
  const feed = lanes.map((lane) => formatLaneEvents(lane, byLane[lane])).join('\n\n')
  const laneKeys = lanes.map((lane) => `"${lane}"`).join(' and ')

  const user = `
[BASELINE CONTEXT: Existing User Language Profile, split by lane — only lanes with new evidence are shown]
${JSON.stringify(baseline, null, 2)}

[INCREMENTAL LEARNER EVENTS, split by lane]
${feed}

Instruction: Execute an "Intelligent Upsert (智能增删改)" on each lane's baseline using ONLY that lane's events. Return ONLY the JSON object with the lane keys ${laneKeys}.
`

  const langRule = `Output language: Write all weakness descriptions, focus categories, and recommendation reasons in ${spec.isEnglish ? 'clear English' : spec.name}.`
  const audienceScope = spec.isEnglish
    ? 'Lexicon is operating in English-English mode for a native or monolingual English user. Analyze English vocabulary, usage, register, clarity, and expression patterns without assuming second-language transfer.'
    : `Lexicon is an English learning tool for ${spec.audience}. Analyze English learning patterns and ${spec.transferLabel} only.`
  const transferErrorRule = spec.isEnglish
    ? 'English usage, register, or expression gaps'
    : `${spec.transferLabel} errors`
  const supportLanguageRule = spec.supportLanguage
    ? `OUT searches written in ${getNativeLanguage(spec.supportLanguage).name} are expression needs, not English grammar errors. Put them in recent exploration focus or recommendations; never invent an English error from them.`
    : 'English-English mode has no non-English support language. Ignore non-English events completely and never infer a translation-transfer error.'

  const weaknessSchema = `{
      "id": "weakness_1",
      "description": "Short description of the language gap/mistake pattern (e.g. 习惯用 deep 抽象视力度数)",
      "sourceTrigger": "Source trigger details (e.g. 句子订正: My eyesight is deep / AI 追问)",
      "track": "vocabulary" | "phrase_metaphor" | "syntax_thought",
      "status": "learning" | "mastered",
      "occurrenceCount": 2,
      "contrastExample": "My eyesight is deep -> My vision is poor / I'm short-sighted",
      "confidence": 0.3,
      "lastExposedAt": "2026-09-07T12:00:00.000Z",
      "improvementQuote": "OPTIONAL — only when raising confidence or marking mastered: the learner's correct words copied EXACTLY from a <learner_original> block"
      ,"improvementEventId": "REQUIRED with improvementQuote: the exact eventId of the OUT sentence/production containing that independent production, never a Q&A event"
    }`
  const laneSchema = `{
    "weaknessPatterns": [ ${weaknessSchema} ],
    "recentExplorationFocus": [ { "category": "Category tag (e.g. phrasal_verbs_with_out)", "searchedItems": ["item1", "item2"] } ],
    "recommendations": [ { "conceptOrWord": "Recommended word or spatial concept (e.g. beyond, across)", "reason": "1 sentence reason linking to recent weakness/searches" } ]
  }`

  const system = `You are an expert cognitive linguistics AI profile analyzer designed for high-context models (e.g. Gemini 2.0 Flash / Flash Lite).
Your task is to perform an "Intelligent Upsert (智能增删改)" on the baseline user language profile using rich incremental events.

CRITICAL SCOPE & LANGUAGE FILTER:
${audienceScope}
If any event is related to non-English learning languages (e.g. Japanese, Korean, French, etc.), COMPLETELY IGNORE IT and do NOT add it as a weakness pattern or recommendation.
${langRule}
${PROVENANCE_LEGEND}
CRITICAL EVIDENCE LANES — NEVER MIX THEM:
- The app has already sorted every event into a lane heading. Lanes are decided by the app, not by you.
- IN means receptive learning from external material. The searched text is NOT the learner's writing. Never infer that the learner likes its style, writes long sentences, or made its grammatical choices. IN events may update receptive vocabulary/comprehension focus only.
- OUT means productive learning. Only an OUT sentence correction is evidence of the learner's own English production and may create syntax/collocation weakness patterns.
- ${supportLanguageRule}
- Q&A evidence comes from the learner's question. Do not attribute the surrounding quoted/context text or the AI answer to the learner.
- Never infer personal style preferences from query length or source-text style.
- A search string is not an authoritative word or definition. It may be a typo or meaningless. Do not invent a lexical meaning or treat an unsupported prior AI gloss as a verified fact; retain only grounded learning questions/patterns.
- Put every item under the key of the lane whose events justify it. Never move an item from one lane to the other.

Intelligent Upsert Rules (apply per lane):
1. BASELINE OVERWRITE: Take that lane's baseline, modify it, and return the complete updated lane.
2. ADD (增): Identify new mental model gaps, ${transferErrorRule}, or vocabulary/phrase misuse patterns from that lane's corrections and Q&A.
3. MODIFY (改): If a weakness pattern recurs, increment its occurrenceCount, refine its description, and provide/update its contrastExample (e.g. "My eyesight is deep -> My vision is poor / I'm short-sighted").
4. DELETE/PRUNE (删/剪枝): Keep at most ${MAX_ACTIVE_PER_LANE} active items (status: "learning") per lane; prune stale/minor ones beyond that. Never invent items to reach a number.
5. RECENT FOCUS: Synthesize 1~3 active exploration categories per lane.
6. RECOMMENDATIONS: Provide 2~4 high-value recommendations per lane with 1-sentence explanations directly linked to that lane's weakness patterns or searches.
7. CONFIDENCE (置信度): For every weakness set "confidence" (0..1) = your estimate that the learner has internalised the fix. LOWER it toward 0 when the pattern recurs in this batch. RAISE it ONLY when an OUT sentence event shows the learner already using the correct form by themselves; provide both "improvementQuote" and "improvementEventId". Q&A wording can quote a correction and is NEVER proof of independent production. An AI correction is evidence of a mistake, never of mastery. One correct instance may show progress, not stable mastery. Preserve existing weakness IDs. Mere absence or elapsed time is NOT mastery evidence. Keep the prior value if there is no new evidence.
8. LAST EXPOSED: Set "lastExposedAt" to the timestamp of the most recent event in this batch that touched the pattern. If untouched this batch, keep the prior value.

Output schema (include ONLY the lane keys ${laneKeys}):
{
  ${lanes.map((lane) => `"${lane}": ${laneSchema}`).join(',\n  ')}
}

OUTPUT REQUIREMENT: Output ONLY raw valid JSON (1500~3000 Tokens output capacity). Do NOT include markdown code fences or conversational text.`

  return { system, user, lanes }
}

interface LaneSection {
  weaknessPatterns: unknown[]
  recentExplorationFocus: unknown[]
  recommendations: unknown[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validSection(value: unknown): value is LaneSection {
  if (!isObject(value)) return false
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const optionalText = (v: unknown) => v === undefined || typeof v === 'string'
  return Array.isArray(value.weaknessPatterns) && value.weaknessPatterns.every((w: unknown) =>
    isObject(w) && text(w.id) && text(w.description) && text(w.sourceTrigger)
    && ['vocabulary', 'phrase_metaphor', 'syntax_thought'].includes(String(w.track))
    && ['learning', 'mastered'].includes(String(w.status))
    && typeof w.occurrenceCount === 'number' && Number.isInteger(w.occurrenceCount) && w.occurrenceCount >= 0
    && optionalText(w.contrastExample) && optionalText(w.lastExposedAt)
    && (w.confidence === undefined || (typeof w.confidence === 'number' && Number.isFinite(w.confidence))))
    && new Set(value.weaknessPatterns.map(w => w.id)).size === value.weaknessPatterns.length
    && Array.isArray(value.recentExplorationFocus) && value.recentExplorationFocus.every((f: unknown) =>
      isObject(f) && text(f.category) && Array.isArray(f.searchedItems) && f.searchedItems.every(text))
    && Array.isArray(value.recommendations) && value.recommendations.every((r: unknown) =>
      isObject(r) && text(r.conceptOrWord) && text(r.reason))
}

/** Lane-keyed answer, or a flat answer when the batch only had one lane (older prompt shape). */
function readLaneSections(parsed: unknown, lanes: LearningDirection[]): Partial<Record<LearningDirection, LaneSection>> | null {
  if (!isObject(parsed)) return null
  if (LANES.some((lane) => isObject(parsed[lane]))) {
    const out: Partial<Record<LearningDirection, LaneSection>> = {}
    for (const lane of lanes) {
      const section = parsed[lane]
      if (!validSection(section)) return null
      out[lane] = section
    }
    return out
  }
  // A flat answer cannot say which lane each item belongs to, so it is only
  // usable when the batch itself had a single lane.
  if (lanes.length === 1 && validSection(parsed)) {
    return { [lanes[0]!]: parsed as LaneSection }
  }
  return null
}

/** Words the learner typed in this lane that no AI correction changed. */
function isLearnerQuote(quote: unknown, eventId: unknown, laneEvents: readonly DiagnosticEvent[]): boolean {
  if (typeof quote !== 'string' || !quote.trim()) return false
  return laneEvents.some((e) => {
    if (e.id === eventId && (e.type === 'sentence' || e.type === 'production') && e.learningDirection === 'out') {
      return containsSpan(e.wordOrContext, quote) && containsSpan(e.details || '', quote)
    }
    return false
  })
}

export interface ApplyDiagnosticArgs {
  current: UserLanguageProfile
  snapshot: readonly DiagnosticEvent[]
  targetLanguage: ProfileLearnerLanguage
  nowIso: string
}

/**
 * Merge the AI's lane-keyed answer into the stored profile. Returns null when the
 * answer is unusable, so the caller keeps the events for a later run.
 */
export function applyDiagnosticResult(parsed: unknown, args: ApplyDiagnosticArgs): UserLanguageProfile | null {
  const { current, snapshot, targetLanguage, nowIso } = args
  const lanes = activeLanes(snapshot)
  if (lanes.length === 0) return null
  const sections = readLaneSections(parsed, lanes)
  if (!sections) return null

  const ownsLane = (lane: LearningDirection) =>
    (item: { learningDirection?: LearningDirection; learnerLanguage?: ProfileLearnerLanguage }) =>
      item.learningDirection === lane && (item.learnerLanguage ?? 'zh') === targetLanguage
  const ownedByAnyLane = (item: { learningDirection?: LearningDirection; learnerLanguage?: ProfileLearnerLanguage }) =>
    isLane(item.learningDirection) && (item.learnerLanguage ?? 'zh') === targetLanguage

  const byLane = partitionByLane(snapshot)
  const weaknesses: WeaknessPattern[] = []
  const focus: ExplorationFocus[] = []
  const recommendations: ProfileRecommendation[] = []

  for (const lane of LANES) {
    const owns = ownsLane(lane)
    const priorWeaknesses = current.weaknessPatterns.filter(owns)
    const priorFocus = current.recentExplorationFocus.filter(owns)
    const priorRecommendations = current.recommendations.filter(owns)
    const section = sections[lane]

    // No new evidence (or no usable answer) for this lane: it stays exactly as it was.
    if (!lanes.includes(lane) || !section) {
      weaknesses.push(...priorWeaknesses)
      focus.push(...priorFocus)
      recommendations.push(...priorRecommendations)
      continue
    }

    const stamp = { learningDirection: lane, learnerLanguage: targetLanguage }
    const priorById = new Map(priorWeaknesses.map((w) => [w.id, w]))

    weaknesses.push(...(Array.isArray(section.weaknessPatterns) ? section.weaknessPatterns : priorWeaknesses)
      .filter(isObject)
      .map((raw) => {
        const { improvementQuote, improvementEventId, verifiedProductionIds: _untrustedIds, verifiedProductionTexts: _untrustedTexts, ...rest } = raw as unknown as WeaknessPattern & { improvementQuote?: unknown; improvementEventId?: unknown }
        const prior = priorById.get(rest.id)
        const priorConfidence = prior?.confidence ?? DEFAULT_CONFIDENCE
        const priorStatus = prior?.status ?? 'learning'
        let confidence = clamp01(rest.confidence) ?? priorConfidence
        let status: WeaknessPattern['status'] = rest.status === 'mastered' ? 'mastered' : 'learning'
        const claimsImprovement = confidence > priorConfidence || (status === 'mastered' && priorStatus !== 'mastered')
        const verifiedQuote = isLearnerQuote(improvementQuote, improvementEventId, byLane[lane])
        const verifiedProductionIds = [...new Set([
          ...(prior?.verifiedProductionIds ?? []),
          ...(verifiedQuote && typeof improvementEventId === 'string' ? [improvementEventId] : []),
        ])].slice(-8)
        const event = byLane[lane].find(e => e.id === improvementEventId)
        const verifiedProductionTexts = [...new Set([
          ...(prior?.verifiedProductionTexts ?? []),
          ...(verifiedQuote && event ? [normalizeForMatch(event.wordOrContext)] : []),
        ])].slice(-8)
        if (claimsImprovement && !verifiedQuote) {
          confidence = Math.min(confidence, priorConfidence)
          status = priorStatus
        }
        // A single matching quote supports progress, not stable mastery.
        if (status === 'mastered' && priorStatus !== 'mastered' && verifiedProductionTexts.length < 2) status = 'learning'
        return {
          ...rest,
          status,
          confidence,
          verifiedProductionIds,
          verifiedProductionTexts,
          lastExposedAt: rest.lastExposedAt || prior?.lastExposedAt || nowIso,
          ...stamp,
        } as WeaknessPattern
      }))
    focus.push(...(Array.isArray(section.recentExplorationFocus) ? section.recentExplorationFocus : priorFocus)
      .filter(isObject)
      .map((item) => ({ ...(item as unknown as ExplorationFocus), ...stamp })))
    recommendations.push(...(Array.isArray(section.recommendations) ? section.recommendations : priorRecommendations)
      .filter(isObject)
      .map((item) => ({ ...(item as unknown as ProfileRecommendation), ...stamp })))
  }

  // Legacy (no lane) and other-dictionary records are never shown to the AI and never changed.
  return {
    lastUpdated: nowIso,
    totalDiagnosticsRun: (current.totalDiagnosticsRun || 0) + 1,
    weaknessPatterns: [...weaknesses, ...current.weaknessPatterns.filter((w) => !ownedByAnyLane(w))],
    recentExplorationFocus: [...focus, ...current.recentExplorationFocus.filter((f) => !ownedByAnyLane(f))],
    recommendations: [...recommendations, ...current.recommendations.filter((r) => !ownedByAnyLane(r))],
  }
}
