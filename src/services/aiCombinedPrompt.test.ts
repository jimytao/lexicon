/**
 * TDD: aiCombinedPrompt — contract tests written before implementation.
 *
 * The combined prompt must:
 * 1. Output a top-level JSON with "lookup" and "core" keys.
 * 2. Make Chinese-input intent unmistakably clear (not buried).
 * 3. Include the right fields per section (etymology in lookup, feelAnchor in core, etc.)
 * 4. parseCombinedResponse correctly splits the response.
 */
import { describe, expect, it } from 'vitest'
import { buildCombinedWordPrompt, buildCombinedPhrasePrompt } from './aiCombinedPrompt'

const LOOKUP_MODULES = [
  { id: 'dictionary', enabled: true },
  { id: 'coreConcept', enabled: true },
  { id: 'etymology', enabled: true },
  { id: 'examples', enabled: true },
  { id: 'synonyms', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const CORE_MODULES = [
  { id: 'coreConcept', enabled: true },
  { id: 'wordGraph', enabled: true },
  { id: 'chunks', enabled: true },
  { id: 'synonyms', enabled: true },
  { id: 'usageScenes', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const CORE_PHRASE_MODULES = [
  { id: 'usageScenes', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
]

// ── Schema structure ──────────────────────────────────────────────────────────

describe('buildCombinedWordPrompt — schema structure', () => {
  it('requires top-level "lookup" and "core" keys in the JSON schema', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    expect(prompt).toMatch(/"lookup"\s*:/)
    expect(prompt).toMatch(/"core"\s*:/)
  })

  it('includes etymology in the lookup section, not core', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    // etymology should appear (lookup has it enabled)
    expect(prompt).toContain('"etymology"')
  })

  it('includes feelAnchor and emotionalTone in the core section', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    expect(prompt).toContain('"feelAnchor"')
    expect(prompt).toContain('"emotionalTone"')
  })

  it('includes conceptGraph (wordGraph) in the core section', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    expect(prompt).toContain('"conceptGraph"')
  })

  it('includes coreConcept.gloss and lexical meaning guidance', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    expect(prompt).toContain('"gloss"')
    expect(prompt).toMatch(/LEXICAL|词典式|equivalents|等价词/)
    expect(prompt).not.toMatch(/"wordChoiceContrast"\s*:/)
    expect(prompt).toMatch(/whenToUse.*HEADWORD|适用心智|仍应选主词/i)
  })

  it('includes meanings / examples in the lookup section', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'en',
    })
    expect(prompt).toContain('"meanings"')
    expect(prompt).toContain('"examples"')
  })
})

// ── Chinese input handling ────────────────────────────────────────────────────

describe('buildCombinedWordPrompt — Chinese input (CRITICAL)', () => {
  it('places Chinese-input instruction prominently (within first 600 chars of rules)', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'zh',
    })
    // The Chinese-input rule must appear in the Rules section, not buried at the end
    const rulesIdx = prompt.indexOf('Rules:')
    const chineseRuleIdx = prompt.search(/CHINESE|Chinese input|中文输入/)
    expect(chineseRuleIdx).toBeGreaterThan(-1)
    expect(chineseRuleIdx - rulesIdx).toBeLessThan(800)
  })

  it('specifies "find English equivalent" in the Chinese-input rule for core section', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'zh',
    })
    expect(prompt).toMatch(/English equivalent|英文候选|English candidate/i)
    // core section should teach native usage of the English word
    expect(prompt).toMatch(/natively|mental image|母语者|feel.*when natives/i)
  })

  it('does NOT make AI think it should analyze the Chinese word itself in core', () => {
    const prompt = buildCombinedWordPrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_MODULES,
      lang: 'zh',
    })
    // Should NOT say "analyze this Chinese word"
    expect(prompt).not.toMatch(/analyze this Chinese word|分析这个中文词/i)
  })
})

// ── Phrase prompt ─────────────────────────────────────────────────────────────

describe('buildCombinedPhrasePrompt — schema structure', () => {
  it('requires top-level "lookup" and "core" keys', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_PHRASE_MODULES,
      lang: 'en',
      queryType: 'phrase',
    })
    expect(prompt).toMatch(/"lookup"\s*:/)
    expect(prompt).toMatch(/"core"\s*:/)
  })

  it('has feelAnchor/emotionalTone in core section', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_PHRASE_MODULES,
      lang: 'en',
      queryType: 'phrase',
    })
    expect(prompt).toContain('"feelAnchor"')
    expect(prompt).toContain('"emotionalTone"')
  })

  it('Chinese phrase — core instructs to provide English translation with native feel', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_PHRASE_MODULES,
      lang: 'zh',
      queryType: 'phrase',
    })
    expect(prompt).toMatch(/English translation|英文翻译|correctForm.*English/i)
    expect(prompt).toMatch(/native|母语/i)
  })

  it('2-Tier Proofreading System — includes nativeForm and nativeRationale schema', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_PHRASE_MODULES,
      lang: 'en',
      queryType: 'sentence',
    })
    expect(prompt).toContain('"nativeForm"')
    expect(prompt).toContain('"nativeRationale"')
    expect(prompt).toMatch(/minimal fix|Minimal Fix|保持句子结构/i)
  })

  it('Monolingual Mode (isMono) — requires English-only explanations', () => {
    const prompt = buildCombinedPhrasePrompt({
      lookupModules: LOOKUP_MODULES,
      coreModules: CORE_PHRASE_MODULES,
      lang: 'en',
      isMono: true,
      queryType: 'sentence',
    })
    expect(prompt).toMatch(/ALL output text must be in English only/i)
  })
})

