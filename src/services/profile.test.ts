/**
 * TDD for Profile diagnostic aggregation / crash recovery.
 * Target behavior (plan): chat enqueues + idle/hard-boundary flush;
 * success-only dequeue & count reset; cold-start resume for chat/sentence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Must exist before settings/search stores evaluate module scope. */
const memoryStorage = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', storage)
  return storage
})

import { useSettingsStore } from '../stores/settingsStore'
import {
  CHAT_IDLE_MS,
  buildProfilePromptContext,
  flushPendingProfileDiagnostics,
  getPendingEvents,
  getProfile,
  getUnprocessedCount,
  recordAiChatEvent,
  recordLookupEvent,
  recordSentenceCorrectionEvent,
  resetProfile,
  resumePendingProfileDiagnostics,
  saveProfile,
  __resetProfileRuntimeForTests,
} from './profile'
import { DEFAULT_CONFIDENCE } from '../utils/profileHeat'
import type { UserLanguageProfile, WeaknessPattern } from '../types'

const PROFILE_KEY = 'lexicon-user-profile'
const COUNT_KEY = 'lexicon-unprocessed-count'
const PENDING_KEY = 'lexicon-pending-profile-events'
const SETTINGS_KEY = 'lexicon-settings'

function enableDiagnosticAi() {
  useSettingsStore.setState({
    enableProfileDiagnostic: true,
    aiProvider: 'test',
    aiEndpoint: 'https://example.test/v1',
    aiApiKeys: { test: 'sk-test' },
    aiModels: { test: 'gemini-2.0-flash' },
    aiModel: 'gemini-2.0-flash',
    appLanguage: 'zh',
  })
}

function disableDiagnostic() {
  useSettingsStore.setState({ enableProfileDiagnostic: false })
}

function mockDiagnosticSuccess(overrides?: Partial<{ weaknessPatterns: unknown[] }>) {
  const body = {
    weaknessPatterns: overrides?.weaknessPatterns ?? [
      {
        id: 'w1',
        description: 'test weakness',
        sourceTrigger: 'AI chat',
        track: 'vocabulary',
        status: 'learning',
        occurrenceCount: 1,
      },
    ],
    recentExplorationFocus: [{ category: 'phrasal_verbs', searchedItems: ['run'] }],
    recommendations: [{ conceptOrWord: 'beyond', reason: 'related' }],
  }
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
  }))
}

function mockDiagnosticFailure() {
  return vi.fn(async () => ({
    ok: false,
    status: 500,
  }))
}

/** Hold the first fetch open until release() is called. */
function mockDiagnosticDeferred() {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const fetchMock = vi.fn(async () => {
    await gate
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                weaknessPatterns: [],
                recentExplorationFocus: [],
                recommendations: [],
              }),
            },
          },
        ],
      }),
    }
  })
  return { fetchMock, release: () => release() }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  memoryStorage.clear()
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(COUNT_KEY)
  localStorage.removeItem(PENDING_KEY)
  localStorage.removeItem(SETTINGS_KEY)
  resetProfile()
  __resetProfileRuntimeForTests()
  enableDiagnosticAi()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  __resetProfileRuntimeForTests()
})

describe('recordAiChatEvent — enqueue + idle debounce (no immediate flush)', () => {
  it('enqueues chat but does not call diagnostic AI immediately', () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('run', 'why out?', 'out means exit', 'lookup')

    expect(getPendingEvents()).toHaveLength(1)
    expect(getPendingEvents()[0]).toMatchObject({
      type: 'chat',
      wordOrContext: 'run',
      userQuestion: 'why out?',
      cognitive: 'lookup',
    })
    expect(getPendingEvents()[0]?.id).toEqual(expect.any(String))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resets idle timer on each chat; flushes once after CHAT_IDLE_MS quiet period', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('run', 'q1', 'a1', 'lookup')
    await vi.advanceTimersByTimeAsync(CHAT_IDLE_MS - 1_000)
    expect(fetchMock).not.toHaveBeenCalled()

    recordAiChatEvent('run', 'q2', 'a2', 'lookup')
    await vi.advanceTimersByTimeAsync(CHAT_IDLE_MS - 1_000)
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('does not enqueue when profile diagnostic is disabled', () => {
    disableDiagnostic()
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('run', 'q', 'a', 'lookup')

    expect(getPendingEvents()).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('hard-boundary flush', () => {
  it('flushPendingProfileDiagnostics sends pending chat without waiting for idle', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('apple', 'taste?', 'sweet', 'lookup')
    expect(fetchMock).not.toHaveBeenCalled()

    await flushPendingProfileDiagnostics('context_change')
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('no-ops when pending is empty', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await flushPendingProfileDiagnostics('context_change')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('recordSentenceCorrectionEvent — still immediate', () => {
  it('flushes diagnostic immediately after sentence correction', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordSentenceCorrectionEvent('My eyesight is deep', 'My vision is poor')
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('downgrades IN material to an aggregated lookup instead of treating it as learner writing', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordSentenceCorrectionEvent(
      'Although the source sentence is long, it is not my writing.',
      'Although the source sentence is long, it is not my writing.',
      undefined,
      'in',
    )
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingEvents()).toHaveLength(1)
    expect(getPendingEvents()[0]).toMatchObject({
      type: 'lookup',
      learningDirection: 'in',
    })
  })

  it('does not enqueue irrelevant-language material', () => {
    recordSentenceCorrectionEvent('Guten Morgen', 'Good morning', undefined, 'irrelevant')
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('does not turn an unchanged, natural OUT sentence into a correction event', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordSentenceCorrectionEvent(
      'This sentence is already natural.',
      'This sentence is already natural.',
      undefined,
      'out',
    )
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('ignores formatting-only changes as correction evidence', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordSentenceCorrectionEvent('this is fine', 'This is fine.', undefined, 'out')
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('keeps grammar-significant apostrophe corrections as evidence', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordSentenceCorrectionEvent('I dont know', "I don't know", undefined, 'out')
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('recordLookupEvent — accumulation path B', () => {
  it('flushes at 12 lookups and includes any prior pending chat in that run', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('run', 'q', 'a', 'core')
    expect(fetchMock).not.toHaveBeenCalled()

    for (let i = 0; i < 11; i++) {
      recordLookupEvent(`word${i}`)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getUnprocessedCount()).toBe(11)

    recordLookupEvent('word11')
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const fetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(fetchInit?.body).toEqual(expect.any(String))
    const body = JSON.parse(String(fetchInit!.body))
    const userContent = body.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userContent).toContain('run')
    expect(userContent).toContain('AI Follow-up')
    expect(getPendingEvents()).toHaveLength(0)
    expect(getUnprocessedCount()).toBe(0)
  })
})

describe('success-only mutation / crash safety', () => {
  it('on AI failure keeps pending events and unprocessed count', async () => {
    const fetchMock = mockDiagnosticFailure()
    vi.stubGlobal('fetch', fetchMock)

    for (let i = 0; i < 5; i++) {
      recordLookupEvent(`w${i}`)
    }
    expect(getUnprocessedCount()).toBe(5)

    recordAiChatEvent('gap', 'why?', 'because', 'lookup')
    await flushPendingProfileDiagnostics('context_change')
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalled()
    expect(getPendingEvents().some((e) => e.type === 'chat')).toBe(true)
    expect(getPendingEvents().filter((e) => e.type === 'lookup')).toHaveLength(5)
    expect(getUnprocessedCount()).toBe(5)
  })

  it('events enqueued during an in-flight diagnostic survive and are not wiped', async () => {
    const { fetchMock, release } = mockDiagnosticDeferred()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('first', 'q1', 'a1', 'lookup')
    const flush1 = flushPendingProfileDiagnostics('context_change')
    await flushMicrotasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    recordAiChatEvent('second', 'q2', 'a2', 'lookup')
    expect(getPendingEvents().some((e) => e.wordOrContext === 'second')).toBe(true)

    release()
    await flush1
    await flushMicrotasks()

    // first batch removed; second must remain (or be consumed by queued re-flush)
    const pending = getPendingEvents()
    const stillHasSecond = pending.some((e) => e.wordOrContext === 'second')
    const secondWasFlushedSeparately = fetchMock.mock.calls.length >= 2
    expect(stillHasSecond || secondWasFlushedSeparately).toBe(true)
    if (secondWasFlushedSeparately) {
      expect(getPendingEvents().filter((e) => e.wordOrContext === 'second')).toHaveLength(0)
    }
  })
})

describe('resumePendingProfileDiagnostics — cold start', () => {
  it('flushes when pending contains chat', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    // Simulate leftover queue from a killed session (no live timer).
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        {
          id: 'evt-chat-1',
          type: 'chat',
          wordOrContext: 'persist',
          userQuestion: 'q',
          aiAnswer: 'a',
          cognitive: 'lookup',
          timestamp: new Date().toISOString(),
        },
      ]),
    )

    await resumePendingProfileDiagnostics()
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('flushes when pending contains sentence', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        {
          id: 'evt-sent-1',
          type: 'sentence',
          wordOrContext: 'My eyesight is deep',
          details: 'My vision is poor',
          timestamp: new Date().toISOString(),
        },
      ]),
    )

    await resumePendingProfileDiagnostics()
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not flush when pending is lookup-only (wait for path B)', async () => {
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        {
          id: 'evt-lookup-1',
          type: 'lookup',
          wordOrContext: 'apple',
          timestamp: new Date().toISOString(),
        },
      ]),
    )
    localStorage.setItem(COUNT_KEY, '3')

    await resumePendingProfileDiagnostics()
    await flushMicrotasks()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingEvents()).toHaveLength(1)
    expect(getUnprocessedCount()).toBe(3)
  })

  it('no-ops when diagnostic disabled', async () => {
    disableDiagnostic()
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        {
          id: 'evt-chat-2',
          type: 'chat',
          wordOrContext: 'x',
          userQuestion: 'q',
          aiAnswer: 'a',
          timestamp: new Date().toISOString(),
        },
      ]),
    )

    await resumePendingProfileDiagnostics()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('CHAT_IDLE_MS constant', () => {
  it('is 90 seconds', () => {
    expect(CHAT_IDLE_MS).toBe(90_000)
  })
})

// ── Direction G: heat fields normalisation + Direction A: compact prompt context ──

const FIXED_NOW = new Date('2026-09-07T12:00:00.000Z')
const DAY = 86_400_000
const isoDaysAgo = (n: number) => new Date(FIXED_NOW.getTime() - n * DAY).toISOString()

function mkWeakness(over: Partial<WeaknessPattern>): WeaknessPattern {
  return {
    id: over.id ?? 'w',
    description: over.description ?? 'desc',
    sourceTrigger: over.sourceTrigger ?? 'src',
    track: over.track ?? 'vocabulary',
    status: over.status ?? 'learning',
    occurrenceCount: over.occurrenceCount ?? 1,
    learningDirection: over.learningDirection ?? 'in',
    ...over,
  }
}

function seedProfile(weaknessPatterns: WeaknessPattern[], extra: Partial<UserLanguageProfile> = {}) {
  const p: UserLanguageProfile = {
    lastUpdated: isoDaysAgo(1),
    totalDiagnosticsRun: 3,
    weaknessPatterns,
    recentExplorationFocus: [],
    recommendations: [],
    ...extra,
  }
  saveProfile(p)
  return p
}

describe('getProfile — heat field back-compat normalisation', () => {
  beforeEach(() => vi.setSystemTime(FIXED_NOW))

  it('fills missing confidence with DEFAULT_CONFIDENCE and missing lastExposedAt with profile.lastUpdated', () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        lastUpdated: isoDaysAgo(2),
        totalDiagnosticsRun: 1,
        weaknessPatterns: [
          { id: 'a', description: 'x', sourceTrigger: 's', track: 'vocabulary', status: 'learning', occurrenceCount: 2 },
        ],
        recentExplorationFocus: [],
        recommendations: [],
      }),
    )
    const w = getProfile().weaknessPatterns[0]!
    expect(w.confidence).toBe(DEFAULT_CONFIDENCE)
    expect(w.lastExposedAt).toBe(isoDaysAgo(2))
  })

  it('preserves existing in-range confidence and lastExposedAt', () => {
    seedProfile([mkWeakness({ id: 'a', confidence: 0.7, lastExposedAt: isoDaysAgo(4) })])
    const w = getProfile().weaknessPatterns[0]!
    expect(w.confidence).toBe(0.7)
    expect(w.lastExposedAt).toBe(isoDaysAgo(4))
  })

  it('clamps an out-of-range confidence on read', () => {
    seedProfile([mkWeakness({ id: 'a', confidence: 9 as number, lastExposedAt: isoDaysAgo(1) })])
    expect(getProfile().weaknessPatterns[0]!.confidence).toBe(1)
  })
})

describe('buildProfilePromptContext', () => {
  beforeEach(() => vi.setSystemTime(FIXED_NOW))

  it('returns "" for an empty profile in either variant', () => {
    expect(buildProfilePromptContext('full', 'in')).toBe('')
    expect(buildProfilePromptContext('compact', 'out')).toBe('')
  })

  it('recomputes the lookup counter from events added during an in-flight diagnostic', async () => {
    const { fetchMock, release } = mockDiagnosticDeferred()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('first', 'q1', 'a1', 'lookup')
    const flush1 = flushPendingProfileDiagnostics('context_change')
    await flushMicrotasks()

    recordLookupEvent('later-one')
    recordLookupEvent('later-two')
    expect(getUnprocessedCount()).toBe(2)

    release()
    await flush1
    await flushMicrotasks()

    expect(getPendingEvents().filter((event) => event.type === 'lookup')).toHaveLength(2)
    expect(getUnprocessedCount()).toBe(2)
  })

  it('injects only the current IN or OUT evidence lane', () => {
    seedProfile([
      mkWeakness({ id: 'input-gap', description: 'INPUT_ONLY', learningDirection: 'in', confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
      mkWeakness({ id: 'output-gap', description: 'OUTPUT_ONLY', learningDirection: 'out', confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
    ])

    const inputContext = buildProfilePromptContext('compact', 'in')
    const outputContext = buildProfilePromptContext('compact', 'out')

    expect(inputContext).toContain('INPUT_ONLY')
    expect(inputContext).not.toContain('OUTPUT_ONLY')
    expect(outputContext).toContain('OUTPUT_ONLY')
    expect(outputContext).not.toContain('INPUT_ONLY')
  })

  it('injects only profile evidence owned by the active dictionary language', () => {
    seedProfile([
      mkWeakness({ id: 'zh-gap', description: 'ZH_ONLY', learningDirection: 'in', learnerLanguage: 'zh', confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
      mkWeakness({ id: 'vi-gap', description: 'VI_ONLY', learningDirection: 'in', learnerLanguage: 'vi', confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
    ])

    expect(buildProfilePromptContext('compact', 'in', 'zh')).toContain('ZH_ONLY')
    expect(buildProfilePromptContext('compact', 'in', 'zh')).not.toContain('VI_ONLY')
    expect(buildProfilePromptContext('compact', 'in', 'vi')).toContain('VI_ONLY')
    expect(buildProfilePromptContext('compact', 'in', 'vi')).not.toContain('ZH_ONLY')
  })

  it('quarantines legacy weaknesses without a learning direction', () => {
    seedProfile([
      mkWeakness({ id: 'legacy', description: 'LEGACY_UNATTRIBUTED', learningDirection: undefined, confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
    ])
    expect(buildProfilePromptContext('compact', 'in')).not.toContain('LEGACY_UNATTRIBUTED')
    expect(buildProfilePromptContext('compact', 'out')).not.toContain('LEGACY_UNATTRIBUTED')
  })

  it('keeps legacy profile records local during diagnostic upserts', async () => {
    seedProfile([
      mkWeakness({ id: 'directed', description: 'DIRECTED_BASELINE', learningDirection: 'in' }),
      mkWeakness({ id: 'legacy', description: 'LEGACY_LOCAL_ONLY', learningDirection: undefined }),
    ])
    const fetchMock = mockDiagnosticSuccess({ weaknessPatterns: [] })
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('run', 'How is this used?', 'In this context...', 'lookup', 'in')
    await flushPendingProfileDiagnostics('manual')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const request = JSON.parse(String(init.body))
    const prompt = request.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(prompt).toContain('DIRECTED_BASELINE')
    expect(prompt).not.toContain('LEGACY_LOCAL_ONLY')
    expect(getProfile().weaknessPatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy', description: 'LEGACY_LOCAL_ONLY', learningDirection: undefined }),
    ]))
  })

  it('compact: includes only hot weaknesses (excludes cool ones)', () => {
    seedProfile([
      mkWeakness({ id: 'hot', description: 'confuses deep with poor eyesight', confidence: 0.1, lastExposedAt: isoDaysAgo(0) }),
      mkWeakness({ id: 'cool', description: 'article overuse before uncountables', confidence: 0.2, lastExposedAt: isoDaysAgo(40) }),
    ])
    const out = buildProfilePromptContext('compact', 'in')
    expect(out).toContain('confuses deep with poor eyesight')
    expect(out).not.toContain('article overuse before uncountables')
  })

  it('compact: returns "" when no weakness is hot', () => {
    seedProfile([
      mkWeakness({ id: 'a', confidence: 0.2, lastExposedAt: isoDaysAgo(40) }),
      mkWeakness({ id: 'b', confidence: 0.95, lastExposedAt: isoDaysAgo(0) }),
    ])
    expect(buildProfilePromptContext('compact', 'in')).toBe('')
  })

  it('compact: caps at 3 hot weaknesses', () => {
    seedProfile(
      Array.from({ length: 5 }, (_, i) =>
        mkWeakness({ id: `h${i}`, description: `HOTMARK_${i}`, confidence: 0.05, lastExposedAt: isoDaysAgo(0) }),
      ),
    )
    const out = buildProfilePromptContext('compact', 'in')
    const hits = [...out.matchAll(/HOTMARK_/g)].length
    expect(hits).toBe(3)
  })

  it('compact: instruction is soft / opt-in (no forced mentor tip)', () => {
    seedProfile([mkWeakness({ id: 'hot', confidence: 0.1, lastExposedAt: isoDaysAgo(0) })])
    const out = buildProfilePromptContext('compact', 'in').toLowerCase()
    expect(out).toMatch(/only if|optional|may add|do not force|never force/)
  })

  it('full: still emits the existing mentor-tip instruction and all active weaknesses', () => {
    seedProfile([
      mkWeakness({ id: 'a', description: 'AA gap', confidence: 0.2, lastExposedAt: isoDaysAgo(40) }),
      mkWeakness({ id: 'b', description: 'BB gap', confidence: 0.2, lastExposedAt: isoDaysAgo(0) }),
    ])
    const out = buildProfilePromptContext('full', 'in')
    expect(out).toContain('AA gap')
    expect(out).toContain('BB gap')
    expect(out.toLowerCase()).toContain('mentor')
  })

  it('requires an attributable lane before returning profile evidence', () => {
    seedProfile([mkWeakness({ id: 'a', description: 'AA gap', learningDirection: 'in', confidence: 0.2, lastExposedAt: isoDaysAgo(0) })])
    expect(buildProfilePromptContext('compact', 'irrelevant')).toBe('')
  })

  it('compact: carries at most two recent focus areas as soft example guidance', () => {
    seedProfile([], {
      recentExplorationFocus: [
        { category: 'emotion_language', searchedItems: ['upset'], learningDirection: 'in' },
        { category: 'workplace_tone', searchedItems: ['decline'], learningDirection: 'in' },
        { category: 'travel', searchedItems: ['boarding'], learningDirection: 'in' },
      ],
    })
    const out = buildProfilePromptContext('compact', 'in')
    expect(out).toContain('emotion_language')
    expect(out).toContain('workplace_tone')
    expect(out).not.toContain('travel')
    expect(out.toLowerCase()).toMatch(/only if|clearly relevant|never replace/)
  })

  it('full: excludes mastered weaknesses from live sentence personalization', () => {
    seedProfile([
      mkWeakness({ id: 'active', description: 'ACTIVE_GAP', status: 'learning' }),
      mkWeakness({ id: 'done', description: 'MASTERED_GAP', status: 'mastered' }),
    ])
    const out = buildProfilePromptContext('full', 'in')
    expect(out).toContain('ACTIVE_GAP')
    expect(out).not.toContain('MASTERED_GAP')
  })

  it('full: caps active weakness injection to the six highest-priority items', () => {
    seedProfile(Array.from({ length: 8 }, (_, index) => mkWeakness({
      id: `full-${index}`,
      description: `FULLMARK_${index}`,
      confidence: index / 10,
      lastExposedAt: isoDaysAgo(0),
    })))
    const out = buildProfilePromptContext('full', 'in')
    expect([...out.matchAll(/FULLMARK_/g)]).toHaveLength(6)
    expect(out).not.toContain('FULLMARK_7')
  })
})

describe('profile diagnostic learner-language policy', () => {
  it('uses Vietnamese identity and output language for the English-Vietnamese dictionary', async () => {
    useSettingsStore.setState({
      mainDictionary: 'en-vi',
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
    })
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('Tôi muốn nói điều này', 'Cách nói nào tự nhiên?', 'Try this expression.', 'lookup', 'out')
    await flushPendingProfileDiagnostics('manual')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const request = JSON.parse(String(init.body))
    const system = request.messages.find((message: { role: string }) => message.role === 'system').content as string
    expect(system).toContain('Vietnamese native speakers')
    expect(system).toContain('Vietnamese-to-English')
    expect(system).not.toContain('Chinese-to-English')
  })

  it('uses an English-native identity and no transfer assumption for English-English', async () => {
    useSettingsStore.setState({ mainDictionary: 'en-en' })
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('register', 'Is this too formal?', 'It is formal.', 'lookup', 'in')
    await flushPendingProfileDiagnostics('manual')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const request = JSON.parse(String(init.body))
    const system = request.messages.find((message: { role: string }) => message.role === 'system').content as string
    expect(system).toContain('English-English mode')
    expect(system).toContain('without assuming second-language transfer')
    expect(system).not.toContain('Chinese-to-English')
  })

  it('preserves another dictionary language lane without exposing it to this diagnostic', async () => {
    seedProfile([
      mkWeakness({ id: 'zh-existing', description: 'ZH_PRIVATE_LANE', learnerLanguage: 'zh', learningDirection: 'out' }),
      mkWeakness({ id: 'vi-existing', description: 'VI_ACTIVE_LANE', learnerLanguage: 'vi', learningDirection: 'out' }),
    ])
    useSettingsStore.setState({
      mainDictionary: 'en-vi',
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
    })
    const fetchMock = mockDiagnosticSuccess()
    vi.stubGlobal('fetch', fetchMock)

    recordAiChatEvent('Tôi muốn nói điều này', 'Cách nói nào tự nhiên?', 'Try this expression.', 'lookup', 'out')
    await flushPendingProfileDiagnostics('manual')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const request = JSON.parse(String(init.body))
    const userPrompt = request.messages.find((message: { role: string }) => message.role === 'user').content as string
    expect(userPrompt).toContain('VI_ACTIVE_LANE')
    expect(userPrompt).not.toContain('ZH_PRIVATE_LANE')
    expect(getProfile().weaknessPatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'zh-existing', learnerLanguage: 'zh' }),
      expect.objectContaining({ id: 'w1', learnerLanguage: 'vi' }),
    ]))
  })
})
