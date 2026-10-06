import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPhrasePrompt } from './aiPhrasePrompt'
import { buildCombinedPhrasePrompt, buildCombinedWordPrompt } from './aiCombinedPrompt'
import { resolveNativeLanguage, type DictionaryRoutingSettings } from './dictionaryContext'
import {
  NATIVE_LANGUAGES,
  buildNativeLanguageContract,
  getNativeLanguage,
  type ExplanationLanguage,
} from './nativeLanguage'

const MODULES = [
  { id: 'dictionary', enabled: true },
  { id: 'coreConcept', enabled: true },
  { id: 'etymology', enabled: true },
  { id: 'synonyms', enabled: true },
  { id: 'chunks', enabled: true },
  { id: 'collocations', enabled: true },
  { id: 'wordGraph', enabled: true },
  { id: 'usageScenes', enabled: true },
  { id: 'examples', enabled: true },
  { id: 'culture', enabled: true },
]

const CJK = /[㐀-鿿]/
const LANGS: ExplanationLanguage[] = ['zh', 'vi', 'en']

function settings(over: Partial<DictionaryRoutingSettings>): DictionaryRoutingSettings {
  return { mainDictionary: 'en-zh', monolingualWord: false, monolingualPhrase: false, monolingualSentence: false, ...over }
}

/** Every learner-facing prompt builder that can be exercised without network/state. */
function allPrompts(language: ExplanationLanguage, lang = 'en'): string[] {
  return [
    buildPhrasePrompt({ modules: MODULES, lang, queryType: 'phrase', explanationLanguage: language }),
    buildPhrasePrompt({ modules: MODULES, lang, queryType: 'sentence', cognitive: 'core', explanationLanguage: language }),
    buildCombinedWordPrompt({ lookupModules: MODULES, coreModules: MODULES, lang, explanationLanguage: language }),
    buildCombinedPhrasePrompt({ lookupModules: MODULES, coreModules: MODULES, lang, queryType: 'sentence', explanationLanguage: language }),
  ]
}

describe('one resolver decides the native language', () => {
  it('monolingual switch beats the main dictionary, per query type', () => {
    expect(resolveNativeLanguage('satisfaction', settings({ mainDictionary: 'en-vi' })).code).toBe('vi')
    expect(resolveNativeLanguage('satisfaction', settings({ mainDictionary: 'en-vi', monolingualWord: true })).code).toBe('en')
    expect(resolveNativeLanguage('satisfaction', settings({ mainDictionary: 'en-zh', monolingualPhrase: true })).code).toBe('zh')
    expect(resolveNativeLanguage('satisfaction', settings({ mainDictionary: 'en-en' })).code).toBe('en')
  })

  it('every registered language is complete', () => {
    for (const code of LANGS) {
      const spec = NATIVE_LANGUAGES[code]
      expect(spec.code).toBe(code)
      expect(spec.name).toBeTruthy()
      expect(spec.audience).toBeTruthy()
      expect(spec.transferLabel).toBeTruthy()
      expect(spec.soundAlikeHint).toBeTruthy()
    }
  })
})

describe('every prompt fetches the same native language', () => {
  for (const code of LANGS) {
    const spec = getNativeLanguage(code)
    it(`${code}: all builders end with the ${spec.name} contract`, () => {
      const contract = buildNativeLanguageContract(spec)
      for (const prompt of allPrompts(code)) {
        expect(prompt.endsWith(contract)).toBe(true)
      }
    })
  }

  it('correctionNote keeps the quoted spans in English and the reason in the native language', () => {
    for (const code of ['zh', 'vi'] as const) {
      const name = getNativeLanguage(code).name
      for (const prompt of allPrompts(code).filter((p) => p.includes('"correctionNote"'))) {
        expect(prompt).toContain(`'• <original English span> -> <corrected English span>: <reason written in ${name}>'`)
        expect(prompt).toContain(`MUST be written in ${name}`)
      }
    }
  })

  it('does not ask the model to print English correction category labels', () => {
    const prompt = buildPhrasePrompt({ modules: MODULES, queryType: 'sentence', explanationLanguage: 'zh' })
    expect(prompt).toMatch(/do NOT print these English category labels/)
  })
})

describe('switching language leaves no residue', () => {
  it('vi and en prompts contain no Chinese characters', () => {
    for (const code of ['vi', 'en'] as const) {
      for (const lang of ['en', 'vi', 'ja']) {
        for (const prompt of allPrompts(code, lang)) {
          expect(prompt).not.toMatch(CJK)
        }
      }
    }
  })

  it('vi prompts never name Chinese as the learner language', () => {
    for (const prompt of allPrompts('vi')) {
      expect(prompt).not.toMatch(/Chinese native speakers|Chinese-to-English transfer|in Chinese/)
    }
  })

  it('zh prompts never name Vietnamese', () => {
    for (const prompt of allPrompts('zh')) {
      expect(prompt).not.toMatch(/Vietnamese/)
    }
  })
})

describe('source contract — prompt code never branches on a concrete language', () => {
  const root = join(__dirname, '..')
  const sources = ['services/ai.ts', 'services/aiPhrasePrompt.ts', 'services/aiCombinedPrompt.ts', 'services/aiPromptGuidance.ts']
    .map((f) => [f, readFileSync(join(root, f), 'utf8')] as const)

  it('no isMono / Vietnamese-learner flags remain in prompt builders', () => {
    for (const [, src] of sources) {
      expect(src).not.toMatch(/\bisMono\b|getIsMono|isVietnameseLearner|useVietnamese/)
      expect(src).not.toMatch(/explanationLanguage === ['"](vi|zh)['"]/)
    }
  })
})
