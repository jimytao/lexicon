/**
 * Split combined requests, end to end through the hook: replies are resolved by
 * hand so the order DeepSeek-style slow responses arrive in can be forced.
 *
 * Pins the two behaviours behind the "AI analysis failed" collisions:
 *   - a reply from a request the user moved away from (or retried) can never
 *     mark the request on screen as failed;
 *   - a query the user left keeps loading in the background, and revisiting it
 *     attaches to that request instead of starting a new one.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('zustand/middleware', async importOriginal => {
  const actual = await importOriginal<typeof import('zustand/middleware')>()
  return { ...actual, persist: (initializer: unknown) => initializer }
})

interface Pending {
  query: string
  half: 'lookup' | 'core'
  signal?: AbortSignal
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}
const calls = vi.hoisted(() => ({ list: [] as Pending[] }))

function deferred(query: string, half: 'lookup' | 'core', signal?: AbortSignal) {
  return new Promise((resolve, reject) => {
    calls.list.push({ query, half, signal, resolve, reject })
    // Mirrors the real transport: an abort settles the call (aiTransport.settleOnAbort).
    signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

vi.mock('../services/ai', () => ({
  analyzeWord: vi.fn(),
  aiFullLookup: vi.fn((word: string, _all: boolean, signal: AbortSignal, half: 'lookup' | 'core') => deferred(word, half, signal)),
  aiPhraseQuery: vi.fn((phrase: string, _all: boolean, signal: AbortSignal, half: 'lookup' | 'core') => deferred(phrase, half, signal)),
  performWebSearch: vi.fn(async () => ''),
  // The early preview never resolves here; it is covered by the store tests.
  resolveQuerySkeleton: vi.fn(() => new Promise(() => undefined)),
  fillMissingCollocationNotes: vi.fn(),
  fillMissingConceptExamples: vi.fn(),
}))
vi.mock('../services/profile', () => ({
  recordSentenceCorrectionEvent: vi.fn(),
  resolveCurrentLearningRoute: vi.fn(() => undefined),
}))

import { useAiLookup } from './useAiLookup'
import { useResultStore } from '../stores/resultStore'
import { useSearchStore } from '../stores/searchStore'
import type { AiFullResult } from '../types'

function full(correctForm: string): AiFullResult {
  return { correctForm, phonetic: '', pos: 'verb', meanings: [{ zh: correctForm, en: correctForm }], examples: [] }
}

let api: ReturnType<typeof useAiLookup>
function Probe() {
  api = useAiLookup()
  return null
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function call(query: string, half: 'lookup' | 'core', nth = 0): Pending {
  const found = calls.list.filter(c => c.query === query && c.half === half)[nth]
  if (!found) throw new Error(`no ${half} call #${nth} for ${query}`)
  return found
}

/** What App.handleWordSelect does before triggering: a new query takes the screen. */
async function search(word: string, force = false) {
  useResultStore.getState().setWordResult(null)
  void api.triggerCombinedLookup(word, force)
  await flush()
}

beforeEach(() => {
  calls.list = []
  useResultStore.getState().clearCache()
  useResultStore.getState().reset()
  useSearchStore.setState({ mode: 'ai' })
  renderToStaticMarkup(createElement(Probe))
  api.cancelAi()
})

describe('collisions between requests', () => {
  it('a reply from the word the user left cannot fail the new word', async () => {
    await search('run')
    await search('walk')

    call('run', 'lookup').reject(new Error('AI API error 503: Server Overloaded'))
    await flush()

    const st = useResultStore.getState()
    expect(st.aiFailedHalves).toEqual({ lookup: false, core: false })
    expect(st.aiPendingHalves).toEqual({ lookup: true, core: true })

    call('walk', 'lookup').resolve(full('walk'))
    await flush()
    expect(useResultStore.getState().aiFullResult?.correctForm).toBe('walk')
  })

  it('retry replaces the old request and ignores whatever it sends back', async () => {
    await search('run')
    await search('run', true) // Try Again

    expect(call('run', 'lookup', 0).signal?.aborted).toBe(true)
    call('run', 'core', 0).resolve(full('stale'))
    await flush()
    expect(useResultStore.getState().aiFullCache['run::core']).toBeUndefined()

    call('run', 'core', 1).resolve(full('fresh'))
    await flush()
    expect(useResultStore.getState().aiFullCache['run::core']?.correctForm).toBe('fresh')
  })

  it('a genuinely failed half shows its real reason, not a generic line', async () => {
    await search('run')
    call('run', 'lookup').reject(new Error('AI API error 503: Server Overloaded'))
    call('run', 'core').resolve(full('run'))
    await flush()

    const st = useResultStore.getState()
    expect(st.aiFailedHalves.lookup).toBe(true)
    expect(st.aiHalfErrors.lookup).toBe('AI API error 503: Server Overloaded')
  })
})

describe('background requests per query', () => {
  it('keeps loading the word the user left and reuses it on revisit', async () => {
    await search('run')
    call('run', 'lookup').resolve(full('run'))
    await flush()

    await search('walk')
    // run's other half lands while walk is on screen
    call('run', 'core').resolve(full('run-core'))
    await flush()
    expect(useResultStore.getState().combinedCache['run::combined']?.core.correctForm).toBe('run-core')
    expect(useResultStore.getState().combinedResult?.core.correctForm).not.toBe('run-core')

    // Revisit: served from cache, no new request
    const before = calls.list.length
    await search('run')
    expect(calls.list.length).toBe(before)
    expect(useResultStore.getState().combinedResult?.core.correctForm).toBe('run-core')
  })

  it('revisiting a word that is still loading attaches to its request', async () => {
    await search('run')
    call('run', 'lookup').resolve(full('run'))
    await flush()
    await search('walk')

    const before = calls.list.length
    await search('run')
    expect(calls.list.length).toBe(before)
    expect(useResultStore.getState().aiFullResult?.correctForm).toBe('run')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: false, core: true })

    call('run', 'core').resolve(full('run-core'))
    await flush()
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: false, core: false })
    expect(useResultStore.getState().combinedResult?.core.correctForm).toBe('run-core')
  })

  it('a tab flip mid-request does not start a second request', async () => {
    await search('run')
    const before = calls.list.length
    void api.triggerCombinedLookup('run', false)
    await flush()
    expect(calls.list.length).toBe(before)
  })

  it('caps the number of queries loading in the background', async () => {
    await search('a')
    await search('b')
    await search('c')
    await search('d')

    expect(call('a', 'lookup').signal?.aborted).toBe(true)
    expect(call('b', 'lookup').signal?.aborted).toBe(false)
    expect(call('d', 'lookup').signal?.aborted).toBe(false)
  })

  it('cancelAi (language change, Instant) stops everything', async () => {
    await search('run')
    await search('walk')
    api.cancelAi()
    expect(call('run', 'lookup').signal?.aborted).toBe(true)
    expect(call('walk', 'core').signal?.aborted).toBe(true)
  })
})
