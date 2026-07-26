import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CORE_MODULES,
  DEFAULT_CORE_PHRASE_MODULES,
  normalizeCoreModules,
  normalizeCorePhraseModules,
} from '../stores/settingsStore'
import { aiFullNeedsExplanationFill } from './aiCompleteness'
import {
  CORE_WORD_MODULE_P1_IDS,
  collocationDataHasVisibleItems,
  conceptGraphHasVisibleContent,
  migrateNativeMindToCoreFields,
  shouldShowConceptGraphEmptyState,
  shouldShowWordChoiceWhenSynonymsOff,
} from './coreMindsetPipeline'
import type { AiFullResult } from '../types'

describe('Pure Core P1 module order (factory defaults)', () => {
  it('DEFAULT_CORE_MODULES follows P1 and includes wordChoice after synonyms', () => {
    const ids = DEFAULT_CORE_MODULES.map((m) => m.id)
    expect(ids).toEqual([...CORE_WORD_MODULE_P1_IDS])
    expect(ids.indexOf('synonyms')).toBeLessThan(ids.indexOf('wordChoice'))
    expect(ids.indexOf('wordGraph')).toBeLessThan(ids.indexOf('synonyms'))
    expect(ids.indexOf('coreConcept')).toBe(0)
  })

  it('wordChoice is enabled by default and labeled as choice contrast', () => {
    const mod = DEFAULT_CORE_MODULES.find((m) => m.id === 'wordChoice')
    expect(mod).toBeDefined()
    expect(mod!.enabled).toBe(true)
    expect(mod!.label.toLowerCase()).toMatch(/choice|contrast|选用|对照/)
  })

  it('normalizeCoreModules(undefined) returns a fresh P1 copy', () => {
    const a = normalizeCoreModules()
    const b = normalizeCoreModules()
    expect(a.map((m) => m.id)).toEqual([...CORE_WORD_MODULE_P1_IDS])
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(DEFAULT_CORE_MODULES[0])
  })

  it('migrates legacy coreModules by inserting wordChoice after synonyms (D2: preserve user order otherwise)', () => {
    const legacy = [
      { id: 'coreConcept', label: 'Usage Image', enabled: true },
      { id: 'wordGraph', label: 'Concept Tree Graph', enabled: true },
      { id: 'chunks', label: 'Prep Phrases', enabled: false },
      { id: 'collocations', label: 'Other Collocations', enabled: true },
      { id: 'synonyms', label: 'Synonyms & Nuances', enabled: true },
      { id: 'usageScenes', label: 'Usage Scenes', enabled: true },
      { id: 'culture', label: 'Cultural Context', enabled: true },
      { id: 'practice', label: 'Usage Practice', enabled: true },
      { id: 'chat', label: 'AI Chat Follow-up', enabled: true },
    ]
    const normalized = normalizeCoreModules(legacy)
    const ids = normalized.map((m) => m.id)
    expect(ids).toContain('wordChoice')
    expect(ids.indexOf('synonyms') + 1).toBe(ids.indexOf('wordChoice'))
    expect(normalized.find((m) => m.id === 'chunks')?.enabled).toBe(false)
  })

  it('does not force wordChoice to re-stick after synonyms once user moved it (D2)', () => {
    const userOrdered = [
      { id: 'coreConcept', label: 'Usage Image', enabled: true },
      { id: 'wordChoice', label: 'Word Choice Contrast', enabled: true },
      { id: 'wordGraph', label: 'Concept Tree Graph', enabled: true },
      { id: 'chunks', label: 'Prep Phrases', enabled: true },
      { id: 'collocations', label: 'Other Collocations', enabled: true },
      { id: 'synonyms', label: 'Synonyms & Nuances', enabled: true },
      { id: 'usageScenes', label: 'Usage Scenes', enabled: true },
      { id: 'culture', label: 'Cultural Context', enabled: true },
      { id: 'practice', label: 'Usage Practice', enabled: true },
      { id: 'chat', label: 'AI Chat Follow-up', enabled: true },
    ]
    const ids = normalizeCoreModules(userOrdered).map((m) => m.id)
    expect(ids).toContain('wordChoice')
    expect(ids.indexOf('wordChoice')).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('wordChoice')).toBeLessThan(ids.indexOf('synonyms'))
  })
})

describe('Pure Core phrase modules include wordChoice', () => {
  it('DEFAULT_CORE_PHRASE_MODULES contains wordChoice as a draggable module', () => {
    const ids = DEFAULT_CORE_PHRASE_MODULES.map((m) => m.id)
    expect(ids).toContain('wordChoice')
  })

  it('normalizeCorePhraseModules inserts missing wordChoice', () => {
    const legacy = [
      { id: 'usageScenes', label: 'Usage Scenes', enabled: true },
      { id: 'culture', label: 'Cultural Context', enabled: true },
      { id: 'practice', label: 'Usage Practice', enabled: true },
      { id: 'chat', label: 'AI Chat Follow-up', enabled: true },
    ]
    const ids = normalizeCorePhraseModules(legacy).map((m) => m.id)
    expect(ids).toContain('wordChoice')
  })
})

describe('migrateNativeMindToCoreFields (M2 + E3 + L2 compat)', () => {
  const legacyMind = {
    mentalPicture: '烛光下丝绸那层细光',
    emotionalStance: '精致、被照料过的愉悦',
    whyChooseThisWord: '比 shine 更柔，比 gloss 更不油',
  }

  it('maps mentalPicture → feelAnchor and emotionalStance → emotionalTone when new fields empty', () => {
    const migrated = migrateNativeMindToCoreFields({
      coreConcept: { image: '柔和光泽', explanation: '表面均匀反光' },
      nativeMindModel: legacyMind,
    })
    expect(migrated.coreConcept?.feelAnchor).toBe(legacyMind.mentalPicture)
    expect(migrated.coreConcept?.emotionalTone).toBe(legacyMind.emotionalStance)
    expect(migrated.coreConcept?.image).toBe('柔和光泽')
    expect(migrated.coreConcept?.explanation).toBe('表面均匀反光')
  })

  it('does not overwrite existing feelAnchor / emotionalTone', () => {
    const migrated = migrateNativeMindToCoreFields({
      coreConcept: {
        image: '柔和光泽',
        explanation: '…',
        feelAnchor: '已有感觉锚',
        emotionalTone: '已有情绪',
      },
      nativeMindModel: legacyMind,
    })
    expect(migrated.coreConcept?.feelAnchor).toBe('已有感觉锚')
    expect(migrated.coreConcept?.emotionalTone).toBe('已有情绪')
  })

  it('keeps structured wordChoiceContrast and does not invent rows from prose', () => {
    const contrast = [{ vs: 'shine', reason: '要柔匀高级感时用 sheen' }]
    const migrated = migrateNativeMindToCoreFields({
      coreConcept: { image: 'x', explanation: 'y' },
      nativeMindModel: legacyMind,
      wordChoiceContrast: contrast,
    })
    expect(migrated.wordChoiceContrast).toEqual(contrast)
    expect(migrated.whyChooseFallback).toBeUndefined()
  })

  it('exposes whyChooseFallback only when contrast missing', () => {
    const migrated = migrateNativeMindToCoreFields({
      coreConcept: { image: 'x', explanation: 'y' },
      nativeMindModel: legacyMind,
    })
    expect(migrated.wordChoiceContrast).toBeUndefined()
    expect(migrated.whyChooseFallback).toBe(legacyMind.whyChooseThisWord)
  })

  it('handles missing nativeMindModel / coreConcept safely', () => {
    expect(migrateNativeMindToCoreFields({})).toEqual({})
    expect(
      migrateNativeMindToCoreFields({
        nativeMindModel: legacyMind,
      }).coreConcept?.feelAnchor,
    ).toBe(legacyMind.mentalPicture)
  })
})

describe('concept graph empty-state visibility', () => {
  it('conceptGraphHasVisibleContent is true when rootCore or branches exist', () => {
    expect(conceptGraphHasVisibleContent({ rootCore: '表面反光', branches: [] })).toBe(true)
    expect(
      conceptGraphHasVisibleContent({
        rootCore: '',
        branches: [{ category: '物理质感', examples: [{ phrase: 'healthy sheen', meaning: '健康光泽' }] }],
      }),
    ).toBe(true)
    expect(conceptGraphHasVisibleContent(undefined)).toBe(false)
    expect(conceptGraphHasVisibleContent({ rootCore: '', branches: [] })).toBe(false)
    expect(conceptGraphHasVisibleContent(null)).toBe(false)
  })

  it('shouldShowConceptGraphEmptyState only when module on and no visible content', () => {
    expect(
      shouldShowConceptGraphEmptyState({ wordGraphEnabled: true, conceptGraph: undefined }),
    ).toBe(true)
    expect(
      shouldShowConceptGraphEmptyState({
        wordGraphEnabled: true,
        conceptGraph: { rootCore: '', branches: [] },
      }),
    ).toBe(true)
    expect(
      shouldShowConceptGraphEmptyState({
        wordGraphEnabled: true,
        conceptGraph: { rootCore: '确认共鸣', branches: [] },
      }),
    ).toBe(false)
    expect(
      shouldShowConceptGraphEmptyState({ wordGraphEnabled: false, conceptGraph: undefined }),
    ).toBe(false)
  })
})

describe('wordChoice vs synonyms independence (F1)', () => {
  it('still shows wordChoice when synonyms module is off but contrast/fallback exists', () => {
    expect(
      shouldShowWordChoiceWhenSynonymsOff({
        wordChoiceEnabled: true,
        synonymsEnabled: false,
        hasContrast: true,
        hasFallback: false,
      }),
    ).toBe(true)
    expect(
      shouldShowWordChoiceWhenSynonymsOff({
        wordChoiceEnabled: true,
        synonymsEnabled: false,
        hasContrast: false,
        hasFallback: true,
      }),
    ).toBe(true)
  })

  it('hides when wordChoice module disabled or no data', () => {
    expect(
      shouldShowWordChoiceWhenSynonymsOff({
        wordChoiceEnabled: false,
        synonymsEnabled: false,
        hasContrast: true,
        hasFallback: true,
      }),
    ).toBe(false)
    expect(
      shouldShowWordChoiceWhenSynonymsOff({
        wordChoiceEnabled: true,
        synonymsEnabled: false,
        hasContrast: false,
        hasFallback: false,
      }),
    ).toBe(false)
  })
})

describe('collocationDataHasVisibleItems (rule C empty arrays)', () => {
  it('is false for missing or empty chunk lists (innit-style skip)', () => {
    expect(collocationDataHasVisibleItems(undefined)).toBe(false)
    expect(collocationDataHasVisibleItems({ chunks: [], collocations: [] })).toBe(false)
  })

  it('is true when either list has items (shrug-style content word)', () => {
    expect(
      collocationDataHasVisibleItems({
        chunks: [],
        collocations: [{ chunk: 'shrug off', note: '摆脱' }],
      }),
    ).toBe(true)
    expect(
      collocationDataHasVisibleItems({
        chunks: [{ chunk: 'on the table', note: '在桌上' }],
        collocations: [],
      }),
    ).toBe(true)
  })
})

describe('aiFullNeedsExplanationFill — Core no longer requires nativeMindModel.mentalPicture', () => {
  const base = {
    correctForm: 'sheen',
    phonetic: '',
    pos: 'n.',
    meanings: [],
  } satisfies AiFullResult

  it('does not treat missing nativeMindModel as incomplete when coreConcept has feel/emotion or image', () => {
    expect(
      aiFullNeedsExplanationFill(
        {
          ...base,
          coreConcept: {
            image: '柔和光泽',
            explanation: '表面均匀反光',
            feelAnchor: '细光',
            emotionalTone: '精致',
          } as AiFullResult['coreConcept'],
          conceptGraph: { rootCore: '表面反光', branches: [{ category: '物理', examples: [] }] },
        },
        'core',
        { wordGraphEnabled: true },
      ),
    ).toBe(false)
  })

  it('still retries when wordGraph on and conceptGraph branches missing', () => {
    expect(
      aiFullNeedsExplanationFill(
        {
          ...base,
          coreConcept: { image: 'x', explanation: 'y' },
          nativeMindModel: {
            mentalPicture: 'a',
            emotionalStance: 'b',
            whyChooseThisWord: 'c',
          },
        },
        'core',
        { wordGraphEnabled: true },
      ),
    ).toBe(true)
  })
})

describe('source wiring — no pinned native mind; graph empty state; no fake tree chrome', () => {
  const root = join(__dirname, '..')

  const coreView = readFileSync(join(root, 'components/ResultView/CoreCognitiveView.tsx'), 'utf8')
  const phraseView = readFileSync(join(root, 'components/ResultView/PhraseView.tsx'), 'utf8')
  const wordGraph = readFileSync(join(root, 'components/ResultView/AiSection/WordGraphCard.tsx'), 'utf8')
  const coreCard = readFileSync(join(root, 'components/ResultView/AiSection/CoreConceptCard.tsx'), 'utf8')
  const settingsStore = readFileSync(join(root, 'stores/settingsStore.ts'), 'utf8')

  it('CoreCognitiveView does not hard-pin NativeMindModelCard above the module loop', () => {
    expect(coreView).not.toMatch(/<NativeMindModelCard[\s\S]*?coreModules\.map/)
    expect(coreView).not.toContain('NativeMindModelCard')
    expect(coreView).toMatch(/case ['"]wordChoice['"]/)
  })

  it('PhraseView Core track does not hard-pin NativeMindModelCard', () => {
    expect(phraseView).not.toContain('NativeMindModelCard')
    expect(phraseView).toMatch(/case ['"]wordChoice['"]/)
  })

  it('WordGraphCard uses empty-state helper instead of silent null-only empty graph', () => {
    expect(wordGraph).toContain('shouldShowConceptGraphEmptyState')
    expect(wordGraph).not.toMatch(/if\s*\(\s*!conceptGraph[\s\S]{0,120}return null/)
    expect(wordGraph).not.toContain('🎯')
    expect(wordGraph).not.toMatch(/mode\.core|Pure Core/)
  })

  it('CoreConceptCard usage path surfaces feelAnchor and emotionalTone', () => {
    expect(coreCard).toContain('feelAnchor')
    expect(coreCard).toContain('emotionalTone')
  })

  it('settingsStore no longer documents nativeMindModel as pinned outside the list', () => {
    expect(settingsStore).not.toMatch(/nativeMindModel.*置顶/)
    expect(settingsStore).toContain("id: 'wordChoice'")
  })

  it('WordChoiceCard exists and renders vs/reason contrast rows', () => {
    const choiceCard = readFileSync(
      join(root, 'components/ResultView/AiSection/WordChoiceCard.tsx'),
      'utf8',
    )
    expect(choiceCard).toContain('wordChoiceContrast')
    expect(choiceCard).toMatch(/vs/)
    expect(choiceCard).toMatch(/reason|whyChooseFallback/)
  })

  it('Pure Core prompt encodes rule C: skip collocations when redundant with conceptGraph', () => {
    const aiSrc = readFileSync(join(root, 'services/ai.ts'), 'utf8')
    expect(aiSrc).toContain('SKIP collocations when redundant with conceptGraph')
    expect(aiSrc).toContain('discourse particle')
    expect(aiSrc).toContain('return "chunks": [] and "collocations": []')
  })
})
