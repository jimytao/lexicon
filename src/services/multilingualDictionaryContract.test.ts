import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCombinedPhrasePrompt, buildCombinedWordPrompt } from './aiCombinedPrompt'
import { resolveDictionaryContext, resolveLearnerLanguagePolicy } from './dictionaryContext'
import { resolveDictionaryTarget } from './db.ops'
import { useResultStore } from '../stores/resultStore'
import { detectLanguage } from '../stores/searchStore'
import { useSettingsStore } from '../stores/settingsStore'

const LOOKUP_MODULES = [
  { id: 'dictionary', enabled: true },
  { id: 'coreConcept', enabled: true },
  { id: 'examples', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const CORE_MODULES = [
  { id: 'coreConcept', enabled: true },
  { id: 'wordGraph', enabled: true },
  { id: 'usageScenes', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const initialSettings = useSettingsStore.getState()
const initialResults = useResultStore.getState()

/**
 * TDD contract for the English–Vietnamese MVP.
 *
 * These tests intentionally describe behavior that does not exist yet. Keep the
 * first implementation small: one shared language-context resolver should make
 * DB routing and prompt routing agree instead of duplicating this matrix.
 */
describe('Vietnamese input detection', () => {
  it('detects accented Vietnamese before the generic Latin/English branch', () => {
    expect(detectLanguage('xin chào')).toBe('vi')
    expect(detectLanguage('Tôi muốn diễn đạt điều này tự nhiên hơn')).toBe('vi')
  })

  it('does not regress existing language detection', () => {
    expect(detectLanguage('hello')).toBe('en')
    expect(detectLanguage('你好')).toBe('zh')
    expect(detectLanguage('こんにちは')).toBe('ja')
    expect(detectLanguage('안녕하세요')).toBe('ko')
  })
})

describe('main dictionary and monolingual precedence', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
      mainDictionary: 'en-vi',
    })
  })

  afterEach(() => {
    useSettingsStore.setState(initialSettings, true)
    useResultStore.setState(initialResults, true)
  })

  it('uses the selected English–Vietnamese main dictionary for a normal word', () => {
    expect(resolveDictionaryTarget('satisfaction')).toBe('envi')
  })

  it('lets word monolingual mode temporarily override the main dictionary', () => {
    useSettingsStore.setState({ monolingualWord: true })
    expect(resolveDictionaryTarget('satisfaction')).toBe('enen')
  })

  it('keeps phrase and sentence monolingual switches independent', () => {
    useSettingsStore.setState({
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: true,
    })

    expect(resolveDictionaryTarget('take care')).toBe('envi')
    expect(resolveDictionaryTarget('I really hope you can take care of this.')).toBe('enen')
  })

  it('restores the main dictionary after a monolingual override is disabled', () => {
    useSettingsStore.setState({ monolingualWord: true })
    expect(resolveDictionaryTarget('satisfaction')).toBe('enen')

    useSettingsStore.setState({ monolingualWord: false })
    expect(resolveDictionaryTarget('satisfaction')).toBe('envi')
  })

  it('keeps English-English available as an explicit main dictionary', () => {
    useSettingsStore.setState({ mainDictionary: 'en-en' })
    expect(resolveDictionaryTarget('satisfaction')).toBe('enen')
  })

  it('uses one shared effective context for dictionary and AI output language', () => {
    expect(resolveDictionaryContext('satisfaction', useSettingsStore.getState())).toEqual({
      queryType: 'word',
      dictionaryTarget: 'envi',
      explanationLanguage: 'vi',
      isMonolingual: false,
    })

    useSettingsStore.setState({ monolingualWord: true })
    expect(resolveDictionaryContext('satisfaction', useSettingsStore.getState())).toEqual({
      queryType: 'word',
      dictionaryTarget: 'enen',
      explanationLanguage: 'en',
      isMonolingual: true,
    })
  })

  it('derives one learner-language policy from the effective dictionary', () => {
    expect(resolveLearnerLanguagePolicy('satisfaction', {
      ...useSettingsStore.getState(),
      mainDictionary: 'en-zh',
    })).toMatchObject({ nativeLanguage: 'zh', supportLanguage: 'zh', profileLanguage: 'zh' })

    expect(resolveLearnerLanguagePolicy('satisfaction', {
      ...useSettingsStore.getState(),
      mainDictionary: 'en-vi',
    })).toMatchObject({ nativeLanguage: 'vi', supportLanguage: 'vi', profileLanguage: 'vi' })

    expect(resolveLearnerLanguagePolicy('satisfaction', {
      ...useSettingsStore.getState(),
      mainDictionary: 'en-en',
    })).toMatchObject({ nativeLanguage: 'en', supportLanguage: null, profileLanguage: 'en' })
  })

  it('clears language-dependent AI caches when the main dictionary changes', () => {
    useResultStore.setState({
      combinedCache: { satisfaction: {} as never },
      combinedResult: {} as never,
    })

    useSettingsStore.getState().setMainDictionary('en-zh')

    expect(useResultStore.getState().combinedCache).toEqual({})
    expect(useResultStore.getState().combinedResult).toBeNull()
  })
})

describe('Vietnamese prompt direction', () => {
  it('English word: Lookup and Core explanations target Vietnamese', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
      explanationLanguage: 'vi',
    } as never)

    expect(prompt).toMatch(/Vietnamese|Tiếng Việt/i)
    expect(prompt).toMatch(/English input[\s\S]*Vietnamese|translate[\s\S]*Vietnamese/i)
    expect(prompt).not.toMatch(/ALL explanatory text[\s\S]*MUST be written in Chinese/i)
  })

  it('Vietnamese input: produces natural English and explains it in Vietnamese', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'vi',
      explanationLanguage: 'vi',
    } as never)

    expect(prompt).toMatch(/Vietnamese input/i)
    expect(prompt).toMatch(/natural English|English equivalent|English expression/i)
    expect(prompt).toMatch(/explain[\s\S]*Vietnamese|Vietnamese explanation/i)
  })

  it('other-language sentence: translates and explains in Vietnamese', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'ja',
      queryType: 'sentence',
      explanationLanguage: 'vi',
    } as never)

    expect(prompt).toMatch(/translate[\s\S]*Vietnamese|Vietnamese translation/i)
    expect(prompt).toMatch(/explanatory text[\s\S]*Vietnamese|explain[\s\S]*Vietnamese/i)
  })

  it('monolingual mode still overrides Vietnamese and requires English only', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'vi',
      queryType: 'sentence',
      explanationLanguage: 'vi',
      isMono: true,
    } as never)

    expect(prompt).toMatch(/ALL output text must be in English only/i)
  })
})

describe('settings and feature-isolation source contracts', () => {
  const root = join(__dirname, '..')
  const settingsView = readFileSync(join(root, 'components/Settings/SettingsView.tsx'), 'utf8')
  const imageStore = readFileSync(join(root, 'stores/imageStore.ts'), 'utf8')

  it('keeps the main dictionary selector and removes the redundant auto-switch control', () => {
    expect(settingsView).toMatch(/mainDictionary|settings\.mainDictionary/)
    expect(settingsView).toContain('<option value="en-en">')
    expect(settingsView).not.toContain('autoSwitchDictionary')
    expect(settingsView).not.toContain('setAutoSwitchDictionary')
  })

  it('does not replace Image Translate independent source/target preferences', () => {
    expect(imageStore).toContain("sourceLang: 'auto'")
    expect(imageStore).toContain("targetLang: '中文'")
    expect(imageStore).not.toContain('mainDictionary')
  })
})
