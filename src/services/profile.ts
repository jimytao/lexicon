import type {
  CognitiveMode,
  LearningDirection,
  LearningRoute,
  ProfileLearnerLanguage,
  UserLanguageProfile,
  UnnaturalMindModel,
  WeaknessPattern,
} from '../types'
import { useSettingsStore } from '../stores/settingsStore'
import { detectLanguage, useSearchStore } from '../stores/searchStore'
import { DEFAULT_CONFIDENCE } from '../utils/profileHeat'
import { resolveLearningRoute } from '../utils/learningDirection'
import {
  applyDiagnosticResult,
  buildDiagnosticPrompts,
  buildLaneProfileContext,
  isLane,
  type DiagnosticEvent,
} from '../harness'
import { learnerLanguagePolicyFor, resolveLearnerLanguagePolicy, type LearnerLanguagePolicy } from './dictionaryContext'
import { buildNativeLanguageContract, getNativeLanguage } from './nativeLanguage'

export type { DiagnosticEvent }

const PROFILE_STORAGE_KEY = 'lexicon-user-profile'
const UNPROCESSED_COUNT_KEY = 'lexicon-unprocessed-count'
const PENDING_EVENTS_KEY = 'lexicon-pending-profile-events'

/** Idle quiet period before aggregating AI chat into one Profile diagnostic. */
export const CHAT_IDLE_MS = 90_000

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

/**
 * Learner-profile context for AI prompts (lane- and language-filtered; see
 * harness/profileContext.ts). `'full'` for sentence analysis, `'compact'` for
 * word / phrase / chat prompts. Returns `''` when there is nothing worth injecting.
 */
export function buildProfilePromptContext(
  variant: 'full' | 'compact',
  direction: LearningRoute,
  learnerLanguage: ProfileLearnerLanguage = 'zh',
): string {
  return buildLaneProfileContext(getProfile(), variant, direction, learnerLanguage)
}

/** Resolve the current query without asking the AI or adding a network call. */
export function resolveCurrentLearningRoute(
  query: string,
  directionSnapshot: LearningDirection = useSearchStore.getState().learningDirection,
): LearningRoute {
  const settings = useSettingsStore.getState()
  return resolveLearningRoute(query, directionSnapshot, settings)
}

function resolveCurrentLearnerLanguage(query: string): ProfileLearnerLanguage {
  return resolveLearnerLanguagePolicy(query, useSettingsStore.getState()).profileLanguage
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

function setUnprocessedCount(count: number): void {
  try {
    localStorage.setItem(UNPROCESSED_COUNT_KEY, String(Math.max(0, count)))
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

  const latestEvent = snapshot[snapshot.length - 1]
  const latestContext = latestEvent?.wordOrContext ?? ''
  const fallbackPolicy = resolveLearnerLanguagePolicy(latestContext, settings)
  const targetLanguage = latestEvent?.learnerLanguage ?? fallbackPolicy.profileLanguage
  const languagePolicy: LearnerLanguagePolicy = learnerLanguagePolicyFor(targetLanguage)
  const spec = getNativeLanguage(languagePolicy.nativeLanguage)

  // Pre-language profiles came from the original English-Chinese implementation.
  // Keep that compatibility only in the zh lane; never leak it into vi/en prompts.
  // Legacy records without a lane are kept locally but never shown to the model:
  // their evidence ownership is unknowable after the fact.
  const ownsTarget = (item: { learningDirection?: LearningDirection; learnerLanguage?: ProfileLearnerLanguage }) =>
    isLane(item.learningDirection) && (item.learnerLanguage ?? 'zh') === targetLanguage
  const profileForDiagnostic: UserLanguageProfile = {
    ...currentProfile,
    weaknessPatterns: currentProfile.weaknessPatterns.filter(ownsTarget),
    recentExplorationFocus: currentProfile.recentExplorationFocus.filter(ownsTarget),
    recommendations: currentProfile.recommendations.filter(ownsTarget),
  }

  const prompts = buildDiagnosticPrompts(snapshot, profileForDiagnostic, spec)
  // Nothing attributable to a lane (e.g. only legacy events): nothing to distil.
  if (prompts.lanes.length === 0) return currentProfile

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
        { role: 'system', content: prompts.system + buildNativeLanguageContract(spec) },
        { role: 'user', content: prompts.user },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Profile diagnostic AI API error ${res.status}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: unknown = null
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

  return applyDiagnosticResult(parsed, {
    current: currentProfile,
    snapshot,
    targetLanguage,
    nowIso: new Date().toISOString(),
  })
}

/**
 * Unified flush: snapshot pending → AI → on success remove only snapshot ids and
 * recompute the lookup count from whatever arrived while the request was in flight.
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

  const pending = getPendingEvents()
  if (pending.length === 0) {
    return null
  }
  const targetLanguage = pending[0]?.learnerLanguage ?? 'zh'
  const snapshot = pending.filter((event) => (event.learnerLanguage ?? 'zh') === targetLanguage)

  _isDiagnosticRunning = true
  clearChatIdleTimer()
  let succeeded = false

  try {
    const currentProfile = getProfile()
    const updated = await runDiagnosticAi(snapshot, currentProfile)
    if (updated) {
      saveProfile(updated)
      removeEventsByIds(snapshot.map((e) => e.id))
      setUnprocessedCount(getPendingEvents().filter((event) => event.type === 'lookup').length)
      succeeded = true
      return updated
    }
  } catch (err) {
    console.warn('[profile] Profile diagnostic failed:', err)
  } finally {
    _isDiagnosticRunning = false
    const remaining = getPendingEvents()
    // Only chain after progress: a failed run (no key, bad JSON, offline) left the
    // same events pending, and re-running at once would spin without end.
    const shouldContinue = succeeded && (
      remaining.some((event) => event.type === 'chat' || event.type === 'sentence')
      || remaining.filter((event) => event.type === 'lookup').length >= LOOKUP_FLUSH_THRESHOLD
    )
    if ((_queuedFlushReason || shouldContinue) && remaining.length > 0) {
      const next = _queuedFlushReason ?? 'cold_start'
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
    learnerLanguage: resolveCurrentLearnerLanguage(word),
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

  // correctForm is mandatory in the phrase schema, including for already-correct
  // input. Only a substantive textual change is correction evidence; casing,
  // whitespace and punctuation alone must not manufacture a learner weakness.
  const comparable = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/\p{P}/gu, (mark) => (mark === "'" || mark === '-' ? mark : ''))
    .replace(/[\p{S}\s]+/gu, '')
  if (!correction.trim() || comparable(original) === comparable(correction)) return

  const events = getPendingEvents()
  events.push({
    id: newEventId(),
    type: 'sentence',
    wordOrContext: original,
    details: correction,
    unnaturalMindModel,
    learningDirection: route,
    learnerLanguage: resolveCurrentLearnerLanguage(original),
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
  routeQuery: string = wordOrContext,
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
    learnerLanguage: resolveCurrentLearnerLanguage(routeQuery),
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  scheduleChatIdleFlush()
}
