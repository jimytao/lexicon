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
  flushPendingProfileDiagnostics,
  getPendingEvents,
  getUnprocessedCount,
  recordAiChatEvent,
  recordLookupEvent,
  recordSentenceCorrectionEvent,
  resetProfile,
  resumePendingProfileDiagnostics,
  __resetProfileRuntimeForTests,
} from './profile'

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
