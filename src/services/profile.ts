import type {
  CognitiveMode,
  LearningDirection,
  LearningRoute,
  UserLanguageProfile,
  UnnaturalMindModel,
  WeaknessPattern,
} from '../types'
import { useSettingsStore } from '../stores/settingsStore'
import { detectLanguage, useSearchStore } from '../stores/searchStore'
import { DEFAULT_CONFIDENCE, hotWeaknesses } from '../utils/profileHeat'
import { resolveLearningRoute } from '../utils/learningDirection'

export interface DiagnosticEvent {
  /** Stable id for success-only dequeue */
  id: string
  type: 'lookup' | 'sentence' | 'chat'
  wordOrContext: string
  details?: string
  unnaturalMindModel?: UnnaturalMindModel
  userQuestion?: string
  aiAnswer?: string
  /** Lookup vs Pure Core track for AI follow-up events */
  cognitive?: CognitiveMode
  /** Receptive IN vs productive OUT evidence. Legacy events may be unattributed. */
  learningDirection?: LearningDirection
  timestamp: string
}

const PROFILE_STORAGE_KEY = 'lexicon-user-profile'
const UNPROCESSED_COUNT_KEY = 'lexicon-unprocessed-count'
const PENDING_EVENTS_KEY = 'lexicon-pending-profile-events'

/** Idle quiet period before aggregating AI chat into one Profile diagnostic. */
export const CHAT_IDLE_MS = 90_000

const MAX_HIGH_PRIORITY_EVENTS = 12
const LOOKUP_FLUSH_THRESHOLD = 12

export type ProfileFlushReason =
  | 'high_priority'
  | 'accumulation'
  | 'chat_idle'
  | 'context_change'
  | 'mode_switch'
  | 'leave_result'
  | 'pagehide'
  | 'manual'
  | 'cold_start'

// Default profile factory — always returns a fresh timestamp
export function makeDefaultProfile(): UserLanguageProfile {
  return {
    lastUpdated: new Date().toISOString(),
    totalDiagnosticsRun: 0,
    weaknessPatterns: [],
    recentExplorationFocus: [],
    recommendations: [],
  }
}

/** @deprecated Use makeDefaultProfile() instead */
export const DEFAULT_PROFILE: UserLanguageProfile = {
  lastUpdated: new Date().toISOString(),
  totalDiagnosticsRun: 0,
  weaknessPatterns: [],
  recentExplorationFocus: [],
  recommendations: [],
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function isLearningDirection(value: unknown): value is LearningDirection {
  return value === 'in' || value === 'out'
}

/** Back-fill Direction G heat fields on read so legacy / partial profiles still sort by heat. */
function normalizeWeaknesses(list: unknown, profileLastUpdated: string): WeaknessPattern[] {
  if (!Array.isArray(list)) return []
  return list.map((w: WeaknessPattern) => ({
    ...w,
    confidence: clamp01(w.confidence) ?? DEFAULT_CONFIDENCE,
    lastExposedAt: w.lastExposedAt || profileLastUpdated,
    learningDirection: w.learningDirection === 'in' || w.learningDirection === 'out'
      ? w.learningDirection
      : undefined,
  }))
}

export function getProfile(): UserLanguageProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return makeDefaultProfile()
    const parsed = JSON.parse(raw)
    const lastUpdated = parsed.lastUpdated || new Date().toISOString()
    return {
      lastUpdated,
      totalDiagnosticsRun: parsed.totalDiagnosticsRun || 0,
      weaknessPatterns: normalizeWeaknesses(parsed.weaknessPatterns, lastUpdated),
      recentExplorationFocus: Array.isArray(parsed.recentExplorationFocus) ? parsed.recentExplorationFocus : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    }
  } catch {
    return makeDefaultProfile()
  }
}

const weaknessLine = (w: WeaknessPattern) =>
  `- [${w.track || 'grammar'}]: ${w.description || ''}${w.contrastExample ? ` (e.g. ${w.contrastExample})` : ''}`

/**
 * Learner-profile context for AI prompts.
 * - `'full'`   — every active weak spot + focus areas + mentor-tip instruction.
 *                Used by the full-sentence correction prompt.
 * - `'compact'`— only the *hot* weaknesses (Direction G heat, ≤3) + a soft, opt-in
 *                instruction. Injected into everyday word / phrase / chat prompts so
 *                the profile can inform them without steering every answer.
 * Returns `''` when there is nothing worth injecting.
 */
export function buildProfilePromptContext(
  variant: 'full' | 'compact',
  direction: LearningRoute,
): string {
  if (direction === 'irrelevant') return ''
  const profile = getProfile()
  const directedProfile: UserLanguageProfile = {
    ...profile,
    weaknessPatterns: profile.weaknessPatterns.filter((w) => w.learningDirection === direction),
    recentExplorationFocus: profile.recentExplorationFocus.filter((f) => f.learningDirection === direction),
    recommendations: profile.recommendations.filter((r) => r.learningDirection === direction),
  }

  if (variant === 'compact') {
    const hot = hotWeaknesses(directedProfile, Date.now(), 3)
    if (hot.length === 0) return ''
    return (
      "\n\n=== LEARNER'S RECURRING CONFUSIONS (optional personalization) ===\n" +
      hot.map(weaknessLine).join('\n') +
      '\nINSTRUCTION: ONLY IF this query clearly relates to one of the confusions above, you MAY add one short contrast note. Never force it; if there is no clear link, ignore this section.\n'
    )
  }

  if (!directedProfile.weaknessPatterns.length && !directedProfile.recentExplorationFocus.length) {
    return ''
  }
  const weaknesses = directedProfile.weaknessPatterns.map(weaknessLine).join('\n')
  const focus = directedProfile.recentExplorationFocus
    .map(f => `- Category: ${f.category} (${(f.searchedItems || []).slice(0, 5).join(', ')})`)
    .join('\n')

  let res = '\n\n=== USER LEARNING PROFILE & HISTORY ===\n'
  if (weaknesses) res += `Known Weak Spots & Recurring Errors:\n${weaknesses}\n`
  if (focus) res += `Recent Focus Areas:\n${focus}\n`
  res += 'INSTRUCTION: If this query is a sentence or grammar check, reference the user\'s past weak spots if relevant to provide a personalized, encouraging mentor tip.\n'
  return res
}

/** Resolve the current query without asking the AI or adding a network call. */
export function resolveCurrentLearningRoute(query: string): LearningRoute {
  const { learningDirection } = useSearchStore.getState()
  const { mainDictionary } = useSettingsStore.getState()
  return resolveLearningRoute(query, learningDirection, mainDictionary)
}


export function saveProfile(profile: UserLanguageProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}

export function resetProfile(): void {
  saveProfile(makeDefaultProfile())
  resetUnprocessedCount()
  clearPendingEvents()
}

export function getUnprocessedCount(): number {
  try {
    const v = localStorage.getItem(UNPROCESSED_COUNT_KEY)
    return v ? parseInt(v, 10) || 0 : 0
  } catch {
    return 0
  }
}

export function resetUnprocessedCount(): void {
  try {
    localStorage.setItem(UNPROCESSED_COUNT_KEY, '0')
  } catch {
    /* ignore */
  }
}

export function incrementUnprocessedCount(): number {
  const cur = getUnprocessedCount() + 1
  try {
    localStorage.setItem(UNPROCESSED_COUNT_KEY, String(cur))
  } catch {
    /* ignore */
  }
  return cur
}

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ensureEventId(event: DiagnosticEvent): DiagnosticEvent {
  return event.id ? event : { ...event, id: newEventId() }
}

export function getPendingEvents(): DiagnosticEvent[] {
  try {
    const raw = localStorage.getItem(PENDING_EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((e: DiagnosticEvent) => ensureEventId(e))
  } catch {
    return []
  }
}

export function savePendingEvents(events: DiagnosticEvent[]): void {
  try {
    localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(events.slice(-100)))
  } catch {
    /* ignore */
  }
}

export function clearPendingEvents(): void {
  try {
    localStorage.removeItem(PENDING_EVENTS_KEY)
  } catch {
    /* ignore */
  }
}

/** Remove only events consumed by a successful diagnostic snapshot. */
export function removeEventsByIds(ids: string[]): void {
  const idSet = new Set(ids.filter(Boolean))
  if (idSet.size === 0) return
  const remaining = getPendingEvents().filter((e) => !idSet.has(e.id))
  savePendingEvents(remaining)
}

function isDiagnosticEnabled(): boolean {
  return !!useSettingsStore.getState().enableProfileDiagnostic
}

let _isDiagnosticRunning = false
let _chatIdleTimer: ReturnType<typeof setTimeout> | null = null
let _queuedFlushReason: ProfileFlushReason | null = null
let _flushListenersInstalled = false

function clearChatIdleTimer(): void {
  if (_chatIdleTimer !== null) {
    clearTimeout(_chatIdleTimer)
    _chatIdleTimer = null
  }
}

function scheduleChatIdleFlush(): void {
  clearChatIdleTimer()
  _chatIdleTimer = setTimeout(() => {
    _chatIdleTimer = null
    void flushPendingProfileDiagnostics('chat_idle')
  }, CHAT_IDLE_MS)
}

/** Test-only: clear in-memory flush locks / timers between cases. */
export function __resetProfileRuntimeForTests(): void {
  _isDiagnosticRunning = false
  _queuedFlushReason = null
  clearChatIdleTimer()
}

function formatHighPriorityBlock(events: DiagnosticEvent[]): string {
  const high = events
    .filter((e) => e.type === 'sentence' || e.type === 'chat')
    .slice(-MAX_HIGH_PRIORITY_EVENTS)

  if (high.length === 0) return 'None'

  const lines: string[] = []
  let i = 0
  while (i < high.length) {
    const e = high[i]!
    if (e.type === 'sentence') {
      const lane = e.learningDirection === 'out' ? 'OUT / learner production' : 'UNATTRIBUTED'
      lines.push(
        `- [${lane} Sentence Correction]: Original: "${e.wordOrContext}" | Corrected: "${e.details || ''}" | unnaturalMindModel: ${JSON.stringify(
          e.unnaturalMindModel || {},
        )}`,
      )
      i += 1
      continue
    }

    const track =
      e.cognitive === 'core' ? ' / Pure Core' : e.cognitive === 'lookup' ? ' / Lookup' : ''
    const lane = e.learningDirection === 'out' ? 'OUT' : e.learningDirection === 'in' ? 'IN' : 'UNATTRIBUTED'
    const sessionKey = `${e.wordOrContext}||${e.cognitive ?? ''}`
    const session: DiagnosticEvent[] = []
    while (i < high.length) {
      const cur = high[i]!
      if (cur.type !== 'chat') break
      const curKey = `${cur.wordOrContext}||${cur.cognitive ?? ''}`
      if (curKey !== sessionKey) break
      session.push(cur)
      i += 1
    }

    if (session.length === 1) {
      const one = session[0]!
      lines.push(
        `- [${lane} AI Follow-up Q&A${track}]: Context: "${one.wordOrContext}" | User Question: "${
          one.userQuestion || ''
        }" | AI Detailed Answer: "${(one.aiAnswer || '').slice(0, 1000)}"`,
      )
    } else {
      lines.push(`[${lane} AI Follow-up session${track}] Context: "${e.wordOrContext}"`)
      session.forEach((msg, idx) => {
        lines.push(`  Q${idx + 1}: "${msg.userQuestion || ''}"`)
        lines.push(`  A${idx + 1}: "${(msg.aiAnswer || '').slice(0, 1000)}"`)
      })
    }
  }

  return lines.join('\n')
}

async function runDiagnosticAi(
  snapshot: DiagnosticEvent[],
  currentProfile: UserLanguageProfile,
): Promise<UserLanguageProfile | null> {
  const settings = useSettingsStore.getState()
  const providerId = settings.aiProvider || ''
  const endpoint = settings.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || ''
  const apiKey = settings.aiApiKeys[providerId] || import.meta.env.VITE_AI_API_KEY || ''
  const model =
    settings.aiModels[providerId] || settings.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash'

  if (!apiKey || !endpoint) {
    return null
  }

  // Preserve legacy entries locally, but never ask the model to assign them a
  // lane: their evidence ownership is unknowable after the fact.
  const legacyWeaknesses = currentProfile.weaknessPatterns.filter((item) => !isLearningDirection(item.learningDirection))
  const legacyFocus = currentProfile.recentExplorationFocus.filter((item) => !isLearningDirection(item.learningDirection))
  const legacyRecommendations = currentProfile.recommendations.filter((item) => !isLearningDirection(item.learningDirection))
  const profileForDiagnostic: UserLanguageProfile = {
    ...currentProfile,
    weaknessPatterns: currentProfile.weaknessPatterns.filter((item) => isLearningDirection(item.learningDirection)),
    recentExplorationFocus: currentProfile.recentExplorationFocus.filter((item) => isLearningDirection(item.learningDirection)),
    recommendations: currentProfile.recommendations.filter((item) => isLearningDirection(item.learningDirection)),
  }

  const normalPriorityEvents = snapshot.filter((e) => e.type === 'lookup')

  const userPrompt = `
[BASELINE CONTEXT: Existing User Language Profile (user_profile.json)]
${JSON.stringify(profileForDiagnostic, null, 2)}

[INCREMENTAL LEARNER EVENTS (High-Context Feed: 20+ Recent Actions & Q&A)]

🔥 [HIGH PRIORITY: User Explicit Mind Gaps, Sentence Corrections & AI Q&A History]
${formatHighPriorityBlock(snapshot)}

💡 [NORMAL PRIORITY: Recent Word Searches & Core Concepts]
${
  normalPriorityEvents.length > 0
    ? normalPriorityEvents
        .slice(-40)
        .map((e) => {
          const lane = e.learningDirection === 'out' ? 'OUT expression need' : e.learningDirection === 'in' ? 'IN material' : 'unattributed'
          return `- [${lane}] Searched: "${e.wordOrContext}" ${e.details ? `(Core Concept: ${e.details})` : ''}`
        })
        .join('\n')
    : 'None'
}

Instruction: Execute an "Intelligent Upsert (智能增删改)" on the baseline profile using the above incremental learner events. Return ONLY the complete updated UserLanguageProfile JSON object according to the schema.
`

  const appLang = settings.appLanguage || 'zh'
  const langRule =
    appLang === 'en'
      ? 'Output language: Write all weakness descriptions and recommendation reasons in simple, clear English.'
      : 'Output language: Write all weakness descriptions and recommendation reasons in Chinese.'

  const systemPrompt = `You are an expert cognitive linguistics AI profile analyzer designed for high-context models (e.g. Gemini 2.0 Flash / Flash Lite).
Your task is to perform an "Intelligent Upsert (智能增删改)" on the baseline user language profile using rich incremental events.

CRITICAL SCOPE & LANGUAGE FILTER:
Lexicon is strictly an English learning software for Chinese/English speakers.
Analyze ONLY English learning patterns (English vocabulary, phrasal verbs, English syntax/thought, and Chinese-to-English translation transfers).
If any event is related to non-English learning languages (e.g. Japanese, Korean, French, etc.), COMPLETELY IGNORE IT and do NOT add it as a weakness pattern or recommendation.
${langRule}

CRITICAL EVIDENCE LANES — NEVER MIX THEM:
- IN means receptive learning from external material. The searched sentence is NOT the learner's writing. Never infer that the learner likes its style, writes long sentences, or made its grammatical choices. IN lookups may update receptive vocabulary/comprehension focus only.
- OUT means productive learning. Only an OUT English Sentence Correction is evidence of the learner's own English production and may create syntax/collocation weakness patterns.
- OUT searches written in the learner's support language are expression needs, not English grammar errors. Put them in recent exploration focus or recommendations, never invent an English error from them.
- Q&A evidence comes from the learner's question. Do not attribute the surrounding quoted/context text to the learner.
- Never infer personal style preferences from query length or source-text style.
- Every newly created weakness, focus, and recommendation MUST carry learningDirection: "in" or "out" matching its evidence lane.

Intelligent Upsert Rules:
1. BASELINE OVERWRITE: Take the existing user_profile.json as baseline. Modify and return an updated complete UserLanguageProfile JSON.
2. ADD (增): Identify new mental model gaps, Chinese-thinking transfer errors, or vocabulary/phrase misuse patterns from high-priority sentence corrections and AI Q&A history.
3. MODIFY (改): If a weakness pattern recurs, increment its occurrenceCount, refine its description, and provide/update its contrastExample (e.g. "My eyesight is deep -> My vision is poor / I'm short-sighted").
4. DELETE/PRUNE (删/剪枝): Mark resolved or overcome items as status: "mastered". Maintain between 8 and 12 active items (status: "learning"). Prune stale/minor active items if active count exceeds 12.
5. RECENT FOCUS: Synthesize 2~4 active exploration categories in recentExplorationFocus.
6. RECOMMENDATIONS: Provide 3~5 high-value, deep recommendations with 1-sentence explanations directly linked to active weakness patterns or recent searches.
7. CONFIDENCE (置信度): For every weakness set "confidence" (0..1) = your estimate that the learner has internalised the fix. LOWER it toward 0 when the pattern recurs in this batch; RAISE it toward 1 when the pattern is absent and the learner uses the correct form. Keep the prior value if there is no new evidence.
8. LAST EXPOSED: Set "lastExposedAt" to the ISO timestamp of the most recent event in this batch that touched the pattern. If untouched this batch, keep the prior value.

Schema requirements:
{
  "weaknessPatterns": [
    {
      "id": "weakness_1",
      "description": "Short description of the language gap/mistake pattern (e.g. 习惯用 deep 抽象视力度数)",
      "sourceTrigger": "Source trigger details (e.g. 句子订正: My eyesight is deep / AI 追问)",
      "track": "vocabulary" | "phrase_metaphor" | "syntax_thought",
      "status": "learning" | "mastered",
      "occurrenceCount": 2,
      "contrastExample": "My eyesight is deep -> My vision is poor / I'm short-sighted",
      "confidence": 0.3,
      "lastExposedAt": "2026-09-07T12:00:00.000Z",
      "learningDirection": "in" | "out"
    }
  ],
  "recentExplorationFocus": [
    {
      "category": "Category tag (e.g. phrasal_verbs_with_out)",
      "searchedItems": ["item1", "item2"],
      "learningDirection": "in" | "out"
    }
  ],
  "recommendations": [
    {
      "conceptOrWord": "Recommended word or spatial concept (e.g. beyond, across)",
      "reason": "1 sentence reason linking to recent weakness/searches",
      "learningDirection": "in" | "out"
    }
  ]
}

OUTPUT REQUIREMENT: Output ONLY raw valid JSON (1500~3000 Tokens output capacity). Do NOT include markdown code fences or conversational text.`

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Profile diagnostic AI API error ${res.status}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: Partial<UserLanguageProfile> | null = null
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        /* ignore */
      }
    }
  }

  if (!parsed) return null

  const nowIso = new Date().toISOString()
  const priorById = new Map(currentProfile.weaknessPatterns.map((w) => [w.id, w]))
  const batchDirections = [...new Set(
    snapshot
      .map((event) => event.learningDirection)
      .filter((direction): direction is LearningDirection => direction === 'in' || direction === 'out'),
  )]
  const soleBatchDirection = snapshot.length > 0
    && snapshot.every((event) => isLearningDirection(event.learningDirection))
    && batchDirections.length === 1
    ? batchDirections[0]
    : undefined
  const safeDirection = (value: unknown, fallback?: LearningDirection): LearningDirection | undefined =>
    value === 'in' || value === 'out' ? value : fallback
  const mergeHeatFields = (w: WeaknessPattern): WeaknessPattern => {
    const prior = priorById.get(w.id)
    return {
      ...w,
      confidence: clamp01(w.confidence) ?? prior?.confidence ?? DEFAULT_CONFIDENCE,
      lastExposedAt: w.lastExposedAt || prior?.lastExposedAt || nowIso,
      learningDirection: safeDirection(w.learningDirection, prior?.learningDirection ?? soleBatchDirection),
    }
  }

  return {
    lastUpdated: nowIso,
    totalDiagnosticsRun: (currentProfile.totalDiagnosticsRun || 0) + 1,
    weaknessPatterns: Array.isArray(parsed.weaknessPatterns)
      ? [
          ...(parsed.weaknessPatterns as WeaknessPattern[]).map(mergeHeatFields),
          ...legacyWeaknesses,
        ]
      : currentProfile.weaknessPatterns,
    recentExplorationFocus: Array.isArray(parsed.recentExplorationFocus)
      ? [
          ...parsed.recentExplorationFocus.map((focus) => ({
            ...focus,
            learningDirection: safeDirection(focus.learningDirection, soleBatchDirection),
          })),
          ...legacyFocus,
        ]
      : currentProfile.recentExplorationFocus,
    recommendations: Array.isArray(parsed.recommendations)
      ? [
          ...parsed.recommendations.map((recommendation) => ({
            ...recommendation,
            learningDirection: safeDirection(recommendation.learningDirection, soleBatchDirection),
          })),
          ...legacyRecommendations,
        ]
      : currentProfile.recommendations,
  }
}

/**
 * Unified flush: snapshot pending → AI → on success remove only snapshot ids + reset count.
 * Failure / kill-app leaves pending + count intact for cold-start or later triggers.
 */
export async function flushPendingProfileDiagnostics(
  reason: ProfileFlushReason = 'manual',
): Promise<UserLanguageProfile | null> {
  if (!isDiagnosticEnabled()) {
    return null
  }

  if (_isDiagnosticRunning) {
    _queuedFlushReason = reason
    return null
  }

  const snapshot = getPendingEvents()
  if (snapshot.length === 0) {
    return null
  }

  _isDiagnosticRunning = true
  clearChatIdleTimer()

  try {
    const currentProfile = getProfile()
    const updated = await runDiagnosticAi(snapshot, currentProfile)
    if (updated) {
      saveProfile(updated)
      removeEventsByIds(snapshot.map((e) => e.id))
      resetUnprocessedCount()
      return updated
    }
  } catch (err) {
    console.warn('[profile] Profile diagnostic failed:', err)
  } finally {
    _isDiagnosticRunning = false
    if (_queuedFlushReason && getPendingEvents().length > 0) {
      const next = _queuedFlushReason
      _queuedFlushReason = null
      void flushPendingProfileDiagnostics(next)
    } else {
      _queuedFlushReason = null
    }
  }

  return null
}

/** Cold-start resume: flush only when pending has high-value chat/sentence events. */
export async function resumePendingProfileDiagnostics(): Promise<UserLanguageProfile | null> {
  if (!isDiagnosticEnabled()) return null
  const pending = getPendingEvents()
  if (pending.length === 0) return null
  const hasHighValue = pending.some((e) => e.type === 'chat' || e.type === 'sentence')
  if (!hasHighValue) return null
  return flushPendingProfileDiagnostics('cold_start')
}

/** Best-effort pagehide / visibility flush (correctness relies on localStorage + cold start). */
export function initProfileFlushListeners(): void {
  if (_flushListenersInstalled || typeof window === 'undefined') return
  _flushListenersInstalled = true

  const onHide = () => {
    void flushPendingProfileDiagnostics('pagehide')
  }

  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide()
  })
}

/** @deprecated Prefer flushPendingProfileDiagnostics — kept for ProfileModal / callers. */
export async function triggerProfileDiagnostic(
  reason: 'high_priority' | 'accumulation' | ProfileFlushReason = 'manual',
): Promise<UserLanguageProfile | null> {
  return flushPendingProfileDiagnostics(reason)
}

export function recordLookupEvent(
  word: string,
  coreConcept?: string,
  route: LearningRoute = resolveCurrentLearningRoute(word),
): void {
  if (!isDiagnosticEnabled()) return
  if (route === 'irrelevant') return

  const events = getPendingEvents()
  events.push({
    id: newEventId(),
    type: 'lookup',
    wordOrContext: word,
    details: coreConcept,
    learningDirection: route,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  const count = incrementUnprocessedCount()
  if (count >= LOOKUP_FLUSH_THRESHOLD) {
    void flushPendingProfileDiagnostics('accumulation')
  }
}

export function recordSentenceCorrectionEvent(
  original: string,
  correction: string,
  unnaturalMindModel?: UnnaturalMindModel,
  route: LearningRoute = 'out',
): void {
  if (!isDiagnosticEnabled()) return
  if (route === 'irrelevant') return

  // IN sentences are external learning material; support-language OUT queries are
  // expression needs. Both belong in the low-priority lookup stream, never in the
  // learner-writing correction stream.
  if (route === 'in' || detectLanguage(original) !== 'en') {
    recordLookupEvent(original, undefined, route)
    return
  }

  const events = getPendingEvents()
  events.push({
    id: newEventId(),
    type: 'sentence',
    wordOrContext: original,
    details: correction,
    unnaturalMindModel,
    learningDirection: route,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  void flushPendingProfileDiagnostics('high_priority')
}

export function recordAiChatEvent(
  wordOrContext: string,
  userQuestion: string,
  aiAnswer: string,
  cognitive: CognitiveMode = 'lookup',
  route: LearningRoute = resolveCurrentLearningRoute(wordOrContext),
): void {
  if (!isDiagnosticEnabled()) return
  if (route === 'irrelevant') return

  const events = getPendingEvents()
  events.push({
    id: newEventId(),
    type: 'chat',
    wordOrContext,
    userQuestion,
    aiAnswer,
    cognitive,
    learningDirection: route,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  scheduleChatIdleFlush()
}
