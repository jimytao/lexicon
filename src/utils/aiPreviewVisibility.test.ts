import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercise real store transitions and views while isolating browser persistence
// and subscriptions. React SSR otherwise reads Zustand's initial creation state.
vi.mock('zustand/middleware', async importOriginal => {
  const actual = await importOriginal<typeof import('zustand/middleware')>()
  return { ...actual, persist: (initializer: unknown) => initializer }
})
vi.mock('../hooks/useResolvedDark', () => ({ useResolvedDark: () => false }))
vi.mock('../stores/resultStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores/resultStore')>()
  const store = actual.useResultStore
  return { ...actual, useResultStore: Object.assign((select?: (state: ReturnType<typeof store.getState>) => unknown) => select ? select(store.getState()) : store.getState(), store) }
})
vi.mock('../stores/settingsStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores/settingsStore')>()
  const store = actual.useSettingsStore
  return { ...actual, useSettingsStore: Object.assign((select?: (state: ReturnType<typeof store.getState>) => unknown) => select ? select(store.getState()) : store.getState(), store) }
})
vi.mock('../stores/searchStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores/searchStore')>()
  const store = actual.useSearchStore
  return { ...actual, useSearchStore: Object.assign((select?: (state: ReturnType<typeof store.getState>) => unknown) => select ? select(store.getState()) : store.getState(), store) }
})

import { AiFullView } from '../components/ResultView/AiFullView'
import { CoreCognitiveView } from '../components/ResultView/CoreCognitiveView'
import { PhraseView } from '../components/ResultView/PhraseView'
import { useResultStore, type QuerySkeleton } from '../stores/resultStore'
import { useSearchStore } from '../stores/searchStore'
import { DEFAULT_MODULES, DEFAULT_CORE_MODULES, DEFAULT_CORE_PHRASE_MODULES, useSettingsStore } from '../stores/settingsStore'
import { translations } from '../i18n'
import { createAiRequestGate, shouldCommitAiDisplay } from './aiRequestGate'
import { shouldShowAiPreview } from './resultAiVisibility'

const noop = () => {}
const meaning = '可提前阅读的词义'
const skeleton: QuerySkeleton = { correctForm: 'run', pos: 'verb', senses: [{ senseIndex: 1, zh: meaning, en: 'move quickly' }] }
const finalLookup = { correctForm: 'run', phonetic: '', pos: 'verb', meanings: [{ zh: '完整词义', en: 'run' }], examples: [] }

beforeEach(() => {
  useResultStore.getState().clearCache()
  useResultStore.getState().reset()
  useSettingsStore.setState({
    appLanguage: 'zh', modules: DEFAULT_MODULES, coreModules: DEFAULT_CORE_MODULES,
    corePhraseModules: DEFAULT_CORE_PHRASE_MODULES, appearance: 'light',
    monolingualWord: false, monolingualPhrase: false, monolingualSentence: false,
  })
  useSearchStore.setState({ query: 'run', mode: 'ai', queryType: 'word' })
})

afterEach(() => { vi.restoreAllMocks() })

function previewWord() {
  const store = useResultStore.getState()
  store.beginCombined('run', 'normal', 'word')
  store.applyQuerySkeleton('run', skeleton, 'word')
}

function renderLookup(word = 'run', status: 'loading' | 'success' = 'loading') {
  return renderToStaticMarkup(createElement(AiFullView, {
    word, aiFullResult: useResultStore.getState().combinedResult?.lookup ?? null,
    aiStatus: status, aiError: null, onRetry: noop, onWordClick: noop,
  }))
}

function renderCore(status: 'loading' | 'success' = 'loading') {
  return renderToStaticMarkup(createElement(CoreCognitiveView, {
    word: 'run', aiFullResult: useResultStore.getState().combinedResult?.core ?? null,
    aiStatus: status, aiError: null, onRetry: noop, onWordClick: noop,
  }))
}

describe('readable previews while full AI halves are still loading', () => {
  it('renders word senses before the Lookup half finishes, retaining loading and hiding unfinished interactions', () => {
    previewWord()
    const html = renderLookup()
    expect(html).toContain(meaning)
    expect(html).toContain('animate-spin')
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(translations.zh['audio.ukTitle'])
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: true })
    expect(useResultStore.getState().combinedCache).toEqual({})
  })

  it('renders a short Core gloss without a false missing-concept-tree warning or premature practice/chat controls', () => {
    useSearchStore.setState({ mode: 'core' })
    previewWord()
    const html = renderCore()
    expect(html).toContain(meaning)
    expect(html).toContain('animate-spin')
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain(translations.zh['repair.graphEmpty'])
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain(translations.zh['audio.ukTitle'])
  })

  it.each(['ai', 'core'] as const)('renders phrase/sentence translation in %s while its real half stays pending', mode => {
    useSearchStore.setState({ mode, query: 'run into', queryType: 'phrase' })
    const store = useResultStore.getState()
    store.beginCombined('run into', 'normal', 'phrase')
    store.applyQuerySkeleton('run into', { correctForm: 'run into', senses: [{ senseIndex: 1, zh: meaning }] }, 'phrase')
    const state = useResultStore.getState()
    const html = renderToStaticMarkup(createElement(PhraseView, {
      phrase: 'run into', phraseResult: mode === 'core' ? state.combinedPhraseResult?.core ?? null : state.phraseResult,
      aiStatus: 'loading', aiError: null, onRetry: noop,
    }))
    expect(html).toContain(meaning)
    expect(html).toContain('animate-spin')
    expect(html).toContain('animate-pulse')
    expect(html).not.toContain('<textarea')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: true, core: true })
    expect(useResultStore.getState().combinedPhraseCache).toEqual({})
  })

  it('keeps an ordinary new request loading even if the prior result remains in memory', () => {
    previewWord()
    useResultStore.getState().beginCombined('walk', 'normal', 'word')
    const html = renderLookup('walk')
    expect(html).not.toContain(meaning)
    expect(html).toContain('animate-pulse')
  })

  it('never reveals a late skeleton from an older word', () => {
    useResultStore.getState().beginCombined('walk', 'normal', 'word')
    useResultStore.getState().applyQuerySkeleton('run', skeleton, 'word')
    expect(renderLookup('walk')).not.toContain(meaning)
    expect(useResultStore.getState().aiSkeleton).toBeNull()
  })

  it('does not allow a cancelled generation or Instant switch to publish a preview', () => {
    const gate = createAiRequestGate()
    const previous = gate.begin()
    useResultStore.getState().beginCombined('run', 'normal', 'word')
    gate.cancel()
    const publish = (token: number, mode: string) => {
      if (shouldCommitAiDisplay(token, gate, mode)) useResultStore.getState().applyQuerySkeleton('run', skeleton, 'word')
    }
    publish(previous, 'ai')
    const current = gate.begin()
    publish(current, 'instant')
    expect(renderLookup()).not.toContain(meaning)
    expect(useResultStore.getState().aiSkeleton).toBeNull()
  })

  it('lets Lookup become complete independently while Core retains its readable preview and loading state', () => {
    previewWord()
    useResultStore.getState().commitCombinedHalf('run', 'lookup', finalLookup)
    expect(renderLookup('run', 'success')).toContain('完整词义')
    useSearchStore.setState({ mode: 'core' })
    const html = renderCore()
    expect(html).toContain(meaning)
    expect(html).toContain('animate-pulse')
    expect(useResultStore.getState().aiPendingHalves).toEqual({ lookup: false, core: true })
    expect(useResultStore.getState().combinedCache).toEqual({})
  })

  it('replaces the preview with the completed result without changing evidence metadata', () => {
    previewWord()
    const checked = { ...finalLookup, profileInsight: '已校验的学习联系', profileInsightDirection: 'in' as const, profileInsightVersion: 4 }
    useResultStore.getState().commitCombinedHalf('run', 'lookup', checked)
    useResultStore.getState().commitCombinedHalf('run', 'core', finalLookup)
    const html = renderLookup('run', 'success')
    expect(html).toContain('完整词义')
    expect(html).not.toContain(meaning)
    expect(html).not.toContain('animate-pulse')
    expect(useResultStore.getState().combinedResult?.lookup.profileInsightVersion).toBe(4)
    expect(useResultStore.getState().aiIsPartial).toBe(false)
  })
})

describe('preview eligibility', () => {
  const base = { status: 'loading' as const, pending: true, isPartial: true, skeleton, correctForm: 'run' }
  it('rejects mismatched result identity, missing skeletons, settled/failed states, and non-partial data', () => {
    expect(shouldShowAiPreview({ ...base, correctForm: 'walk' })).toBe(false)
    expect(shouldShowAiPreview({ ...base, skeleton: null })).toBe(false)
    expect(shouldShowAiPreview({ ...base, pending: false })).toBe(false)
    expect(shouldShowAiPreview({ ...base, status: 'error' })).toBe(false)
    expect(shouldShowAiPreview({ ...base, status: 'success' })).toBe(false)
    expect(shouldShowAiPreview({ ...base, isPartial: false })).toBe(false)
  })
})
