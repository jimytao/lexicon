import type { UserLanguageProfile, UnnaturalMindModel } from '../types'
import { useSettingsStore } from '../stores/settingsStore'

export interface DiagnosticEvent {
  type: 'lookup' | 'sentence' | 'chat'
  wordOrContext: string
  details?: string
  unnaturalMindModel?: UnnaturalMindModel
  userQuestion?: string
  aiAnswer?: string
  timestamp: string
}

const PROFILE_STORAGE_KEY = 'lexicon-user-profile'
const UNPROCESSED_COUNT_KEY = 'lexicon-unprocessed-count'
const PENDING_EVENTS_KEY = 'lexicon-pending-profile-events'

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

export function getProfile(): UserLanguageProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return makeDefaultProfile()
    const parsed = JSON.parse(raw)
    return {
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      totalDiagnosticsRun: parsed.totalDiagnosticsRun || 0,
      weaknessPatterns: Array.isArray(parsed.weaknessPatterns) ? parsed.weaknessPatterns : [],
      recentExplorationFocus: Array.isArray(parsed.recentExplorationFocus) ? parsed.recentExplorationFocus : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    }
  } catch {
    return makeDefaultProfile()
  }
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

export function getPendingEvents(): DiagnosticEvent[] {
  try {
    const raw = localStorage.getItem(PENDING_EVENTS_KEY)
    return raw ? JSON.parse(raw) : []
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

let _isDiagnosticRunning = false

export async function triggerProfileDiagnostic(
  _reason: 'high_priority' | 'accumulation'
): Promise<UserLanguageProfile | null> {
  const settings = useSettingsStore.getState()
  if (!settings.enableProfileDiagnostic) {
    return null
  }

  // Guard: only one diagnostic can run at a time
  if (_isDiagnosticRunning) return null
  _isDiagnosticRunning = true

  // Reset counter only when we actually start a new diagnostic run (spec section 4.1)
  resetUnprocessedCount()

  try {
    const currentProfile = getProfile()
    const events = getPendingEvents()

    const providerId = settings.aiProvider || ''
    const endpoint = settings.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || ''
    const apiKey = settings.aiApiKeys[providerId] || import.meta.env.VITE_AI_API_KEY || ''
    const model = settings.aiModels[providerId] || settings.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash'

    if (!apiKey || !endpoint) {
      _isDiagnosticRunning = false
      return null
    }

    const highPriorityEvents = events.filter((e) => e.type === 'sentence' || e.type === 'chat')
    const normalPriorityEvents = events.filter((e) => e.type === 'lookup')

    const userPrompt = `
[BASELINE CONTEXT: Existing User Language Profile (user_profile.json)]
${JSON.stringify(currentProfile, null, 2)}

[INCREMENTAL LEARNER EVENTS (High-Context Feed: 20+ Recent Actions & Q&A)]

🔥 [HIGH PRIORITY: User Explicit Mind Gaps, Sentence Corrections & AI Q&A History]
${
  highPriorityEvents.length > 0
    ? highPriorityEvents
        .map((e) =>
          e.type === 'sentence'
            ? `- [Sentence Correction]: Original: "${e.wordOrContext}" | Corrected: "${e.details || ''}" | unnaturalMindModel: ${JSON.stringify(
                e.unnaturalMindModel || {}
              )}`
            : `- [AI Follow-up Q&A]: Context: "${e.wordOrContext}" | User Question: "${
                e.userQuestion || ''
              }" | AI Detailed Answer: "${(e.aiAnswer || '').slice(0, 1000)}"`
        )
        .join('\n')
    : 'None'
}

💡 [NORMAL PRIORITY: Recent Word Searches & Core Concepts]
${
  normalPriorityEvents.length > 0
    ? normalPriorityEvents
        .slice(-40)
        .map((e) => `- Word searched: "${e.wordOrContext}" ${e.details ? `(Core Concept: ${e.details})` : ''}`)
        .join('\n')
    : 'None'
}

Instruction: Execute an "Intelligent Upsert (智能增删改)" on the baseline profile using the above incremental learner events. Return ONLY the complete updated UserLanguageProfile JSON object according to the schema.
`

    const systemPrompt = `You are an expert cognitive linguistics AI profile analyzer designed for high-context models (e.g. Gemini 2.0 Flash / Flash Lite).
Your task is to perform an "Intelligent Upsert (智能增删改)" on the baseline user language profile using rich incremental events.

Intelligent Upsert Rules:
1. BASELINE OVERWRITE: Take the existing user_profile.json as baseline. Modify and return an updated complete UserLanguageProfile JSON.
2. ADD (增): Identify new mental model gaps, Chinese-thinking transfer errors, or vocabulary/phrase misuse patterns from high-priority sentence corrections and AI Q&A history.
3. MODIFY (改): If a weakness pattern recurs, increment its occurrenceCount, refine its description, and provide/update its contrastExample (e.g. "My eyesight is deep -> My vision is poor / I'm short-sighted").
4. DELETE/PRUNE (删/剪枝): Mark resolved or overcome items as status: "mastered". Maintain between 8 and 12 active items (status: "learning"). Prune stale/minor active items if active count exceeds 12.
5. RECENT FOCUS: Synthesize 2~4 active exploration categories in recentExplorationFocus.
6. RECOMMENDATIONS: Provide 3~5 high-value, deep recommendations with 1-sentence Chinese explanations directly linked to active weakness patterns or recent searches.

Schema requirements:
{
  "weaknessPatterns": [
    {
      "id": "weakness_1",
      "description": "Short Chinese description of the language gap/mistake pattern (e.g. 习惯用 deep 抽象视力度数)",
      "sourceTrigger": "Source trigger details (e.g. 句子订正: My eyesight is deep / AI 追问)",
      "track": "vocabulary" | "phrase_metaphor" | "syntax_thought",
      "status": "learning" | "mastered",
      "occurrenceCount": 2,
      "contrastExample": "My eyesight is deep -> My vision is poor / I'm short-sighted"
    }
  ],
  "recentExplorationFocus": [
    {
      "category": "Category tag (e.g. phrasal_verbs_with_out)",
      "searchedItems": ["item1", "item2"]
    }
  ],
  "recommendations": [
    {
      "conceptOrWord": "Recommended word or spatial concept (e.g. beyond, across)",
      "reason": "1 sentence Chinese reason linking to recent weakness/searches"
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

    if (parsed) {
      const updatedProfile: UserLanguageProfile = {
        lastUpdated: new Date().toISOString(),
        totalDiagnosticsRun: (currentProfile.totalDiagnosticsRun || 0) + 1,
        weaknessPatterns: Array.isArray(parsed.weaknessPatterns)
          ? parsed.weaknessPatterns
          : currentProfile.weaknessPatterns,
        recentExplorationFocus: Array.isArray(parsed.recentExplorationFocus)
          ? parsed.recentExplorationFocus
          : currentProfile.recentExplorationFocus,
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : currentProfile.recommendations,
      }

      saveProfile(updatedProfile)
      clearPendingEvents()
      return updatedProfile
    }
  } catch (err) {
    console.warn('[profile] Profile diagnostic failed:', err)
  } finally {
    _isDiagnosticRunning = false
  }

  return null
}

export function recordLookupEvent(word: string, coreConcept?: string): void {
  const events = getPendingEvents()
  events.push({
    type: 'lookup',
    wordOrContext: word,
    details: coreConcept,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  const count = incrementUnprocessedCount()
  if (count >= 12) {
    void triggerProfileDiagnostic('accumulation')
  }
}

export function recordSentenceCorrectionEvent(
  original: string,
  correction: string,
  unnaturalMindModel?: UnnaturalMindModel
): void {
  const events = getPendingEvents()
  events.push({
    type: 'sentence',
    wordOrContext: original,
    details: correction,
    unnaturalMindModel,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  void triggerProfileDiagnostic('high_priority')
}

export function recordAiChatEvent(
  wordOrContext: string,
  userQuestion: string,
  aiAnswer: string
): void {
  const events = getPendingEvents()
  events.push({
    type: 'chat',
    wordOrContext,
    userQuestion,
    aiAnswer,
    timestamp: new Date().toISOString(),
  })
  savePendingEvents(events)

  void triggerProfileDiagnostic('high_priority')
}
